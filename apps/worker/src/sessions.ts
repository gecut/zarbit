import { createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  type LoginStatus,
  type TelegramSessionStatus,
  type WorkerCommand,
} from "@zarbit/contracts";
import { type Store, type SessionRecord } from "@zarbit/db";
import { safeError, rpcCode, isRevoked } from "./errors";
import { SessionFiles } from "./session-files";
import { sessionRef, workerLog } from "./logger";
import type {
  TelegramTransport,
  TransportFactory,
  Account,
  CodeDelivery,
  QuoteEvent,
} from "./transport";

const LOGIN_TTL = 600_000;
interface Runtime {
  userId: string;
  key: string;
  revision: number;
  client: TelegramTransport;
  abort: AbortController;
  online: boolean;
  stop?: () => void;
  closing?: Promise<void>;
}
interface Challenge {
  id: string;
  rt: Runtime;
  phone: string;
  hash: string;
  attempts: number;
  expires: number;
  public: LoginStatus;
  rateKeys: string[];
  blockedUntil?: number;
}
export interface SessionOptions {
  max: number;
  secret: string;
  allowlist: Set<string>;
  files: SessionFiles;
  factory: TransportFactory;
  timeoutMs?: number;
  now?: () => number;
  notify?: (userId: string, text: string) => Promise<void>;
}

export interface SynchronizeResult {
  failures: number;
  recoveryAttempts: number;
  revocations: number;
  scanned: number;
}

export class Sessions {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly challenges = new Map<string, Challenge>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly retry = new Map<string, { at: number; count: number }>();
  private syncing = false;
  private stopped = false;
  onQuote?: (
    userId: string,
    revision: number,
    event: QuoteEvent,
  ) => Promise<void>;
  constructor(
    readonly store: Store,
    private readonly options: SessionOptions,
  ) {}
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private async serial<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(work);
    this.locks.set(userId, pending);
    try {
      return await pending;
    } finally {
      if (this.locks.get(userId) === pending) this.locks.delete(userId);
    }
  }
  private keys(userId: string, phone: string) {
    return [
      `user:${userId}`,
      `phone:${createHmac("sha256", this.options.secret).update(phone).digest("hex")}`,
    ];
  }
  private async authorize(userId: string) {
    const owner = await this.store.owner(userId);
    if (!owner || !this.options.allowlist.has(owner.telegramUserId))
      throw new AppError("FORBIDDEN", "دسترسی این حساب مجاز نیست.", 403);
    return owner;
  }
  private async open(record: SessionRecord): Promise<Runtime> {
    const old = this.runtimes.get(record.userId);
    if (old) return old;
    if (this.stopped)
      throw new AppError("STOPPING", "سرویس در حال راه‌اندازی مجدد است.", 503);
    if (this.runtimes.size >= this.options.max)
      throw new AppError(
        "CAPACITY",
        "ظرفیت اتصال‌ها تکمیل است؛ کمی بعد تلاش کنید.",
      );
    if (!record.storageKey)
      throw new AppError("NO_SESSION", "دوباره وارد تلگرام شوید.");
    await this.options.files.protect(record.storageKey);
    if (this.runtimes.size >= this.options.max)
      throw new AppError("CAPACITY", "ظرفیت اتصال‌ها تکمیل است.");
    // Reserve capacity before any network operation.
    const rt: Runtime = {
      userId: record.userId,
      key: record.storageKey,
      revision: record.revision,
      client: this.options.factory(this.options.files.path(record.storageKey)),
      abort: new AbortController(),
      online: false,
    };
    this.runtimes.set(record.userId, rt);
    return rt;
  }
  private async close(rt: Runtime) {
    rt.online = false;
    rt.stop?.();
    rt.abort.abort();
    await (rt.closing ??= rt.client.close());
    if (this.runtimes.get(rt.userId) === rt) this.runtimes.delete(rt.userId);
  }
  private async io<T>(rt: Runtime, work: () => Promise<T>): Promise<T> {
    if (rt.abort.signal.aborted)
      throw new AppError("CANCELLED", "عملیات ورود لغو شد.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const result = await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          abortListener = () =>
            reject(new AppError("CANCELLED", "عملیات لغو شد."));
          rt.abort.signal.addEventListener("abort", abortListener, {
            once: true,
          });
          timer = setTimeout(
            () =>
              reject(
                new AppError(
                  "TIMEOUT",
                  "پاسخ تلگرام طول کشید؛ دوباره تلاش کنید.",
                  503,
                ),
              ),
            this.options.timeoutMs ?? 20_000,
          );
        }),
      ]);
      if (rt.abort.signal.aborted || this.runtimes.get(rt.userId) !== rt)
        throw new AppError("CANCELLED", "عملیات لغو شد.");
      return result;
    } catch (error) {
      if (error instanceof AppError && error.code === "TIMEOUT")
        await this.close(rt);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (abortListener)
        rt.abort.signal.removeEventListener("abort", abortListener);
    }
  }
  private async announce(userId: string, text: string) {
    try {
      await this.options.notify?.(userId, text);
    } catch (error) {
      workerLog.failure("telegram.notification.failed", error, {
        sessionRef: sessionRef(userId),
      });
    }
  }
  async initialize() {
    await this.options.files.prepare();
    await this.store.recover();
    const records = await this.store.sessions();
    for (const record of records) {
      if (
        record.state === "ERROR" &&
        !record.connectedTelegramUserId &&
        record.storageKey
      ) {
        await this.options.files.remove(record.storageKey);
        await this.store.updateSession(record.userId, record.revision, {
          storageKey: null,
        });
      }
    }
    await this.options.files.cleanOrphans(
      new Set(records.flatMap((r) => (r.storageKey ? [r.storageKey] : []))),
    );
    // Recovery is scheduled independently; HTTP status is available immediately.
  }
  async status(userId: string): Promise<TelegramSessionStatus> {
    const record = await this.store.session(userId);
    const rt = this.runtimes.get(userId);
    const challenge = this.challenges.get(userId);
    const fresh =
      record?.runtimeCheckedAt &&
      this.now() - record.runtimeCheckedAt.getTime() < 30_000;
    const memberFresh =
      record?.membershipCheckedAt &&
      this.now() - record.membershipCheckedAt.getTime() < 60_000;
    return {
      state: record?.state ?? "DISCONNECTED",
      connection: rt?.online ? "CONNECTED" : rt ? "CONNECTING" : "OFFLINE",
      connectedTelegramUserId: record?.connectedTelegramUserId ?? null,
      membershipCheckedAt: record?.membershipCheckedAt?.toISOString() ?? null,
      canManageRequests: Boolean(
        rt?.online &&
        record?.state === "ACTIVE" &&
        record.runtimeReady &&
        fresh &&
        memberFresh,
      ),
      error: record?.lastError ?? null,
      login:
        challenge && challenge.expires > this.now() ? challenge.public : null,
    };
  }
  private async discard(challenge: Challenge, message: string) {
    if (this.challenges.get(challenge.rt.userId) !== challenge) return;
    this.challenges.delete(challenge.rt.userId);
    await this.close(challenge.rt);
    await this.options.files.remove(challenge.rt.key);
    await this.store.updateSession(challenge.rt.userId, challenge.rt.revision, {
      state: "ERROR",
      storageKey: null,
      runtimeReady: false,
      lastError: message,
    });
  }
  private async applyCode(challenge: Challenge, code: CodeDelivery) {
    if (!["app", "sms", "call", "sms_word", "sms_phrase"].includes(code.type))
      throw new AppError(
        "UNSUPPORTED_DELIVERY",
        "این روش ورود تلگرام در زربیت پشتیبانی نمی‌شود؛ تنظیمات ورود را در برنامه رسمی تلگرام بررسی کنید.",
        400,
      );
    challenge.hash = code.hash;
    challenge.public = {
      ...challenge.public,
      step: "CODE",
      delivery: code.type,
      codeLength: code.length,
      error: null,
      resendAvailableAt: code.canResend
        ? new Date(this.now() + Math.max(60, code.timeout) * 1000).toISOString()
        : null,
    };
  }
  private async accepted(challenge: Challenge, account: Account) {
    const rt = challenge.rt;
    const owner = await this.authorize(rt.userId);
    if (account.id !== owner.telegramUserId) {
      try {
        await this.io(rt, () => rt.client.logout());
      } catch {
        this.challenges.delete(rt.userId);
        await this.store.disableSession(
          rt.userId,
          "REVOKING",
          "حساب متفاوت رد شد؛ در حال ابطال اتصال هستیم.",
          rt.revision,
        );
        await this.close(rt);
        throw new AppError(
          "IDENTITY_MISMATCH",
          "حساب متفاوت رد شد؛ قطع اتصال در حال پیگیری است.",
        );
      }
      await this.discard(
        challenge,
        "حساب واردشده متعلق به شما نیست؛ فقط حساب بازکننده مینی‌اپ مجاز است.",
      );
      throw new AppError(
        "IDENTITY_MISMATCH",
        "حساب واردشده با حساب بازکننده مینی‌اپ یکسان نیست.",
      );
    }
    challenge.public.step = "VERIFYING";
    await this.options.files.protect(rt.key);
    await this.store.activateSession(rt.userId, rt.revision, {
      connectedTelegramUserId: account.id,
    });
    const member = await this.io(rt, () => rt.client.membership());
    // Membership errors after authorization retain the session for a safe retry.
    const activated = await this.store.activateSession(rt.userId, rt.revision, {
      state: "ACTIVE",
      lastError: null,
    });
    this.challenges.delete(rt.userId);
    if (!activated.count) return;
    await this.setMembership(rt, member);
    void this.announce(
      rt.userId,
      member
        ? "اتصال تلگرام زربیت فعال شد."
        : "وارد تلگرام شدید؛ پس از عضویت در گروه معامله، بررسی دوباره را بزنید.",
    );
  }
  private async setMembership(rt: Runtime, member: boolean) {
    if (!member) {
      const wasActive = (await this.store.session(rt.userId))?.runtimeReady;
      await this.store.disableSession(
        rt.userId,
        "NOT_IN_GROUP",
        "عضویت در گروه معامله تأیید نشد؛ درخواست‌های اجرا‌نشده لغو شدند.",
        rt.revision,
      );
      await this.store.updateSession(rt.userId, rt.revision, {
        membershipCheckedAt: new Date(this.now()),
      });
      await this.close(rt);
      if (wasActive)
        void this.announce(
          rt.userId,
          "عضویت گروه تأیید نشد؛ درخواست‌های اجرا‌نشده لغو شدند.",
        );
      return false;
    }
    const record = await this.store.session(rt.userId);
    if (
      !record ||
      record.revision !== rt.revision ||
      record.state === "REVOKING" ||
      record.state === "REVOKED"
    )
      return false;
    const activated = await this.store.activateSession(rt.userId, rt.revision, {
      state: "ACTIVE",
      runtimeReady: true,
      runtimeCheckedAt: new Date(this.now()),
      membershipCheckedAt: new Date(this.now()),
      lastError: null,
    });
    if (!activated.count) return false;
    rt.online = true;
    if (!rt.stop)
      rt.stop = rt.client.subscribe((event) => {
        void this.serial(rt.userId, async () => {
          if (rt.online && !this.stopped)
            await this.onQuote?.(rt.userId, rt.revision, event);
        }).catch((error) =>
          workerLog.failure("telegram.quote.processing_failed", error, {
            sessionRef: sessionRef(rt.userId),
          }),
        );
      });
    return true;
  }
  private async recoverRuntime(record: SessionRecord) {
    const rt = await this.open(record);
    try {
      const self = await this.io(rt, () => rt.client.getMe());
      const owner = await this.authorize(record.userId);
      if (
        self.id !== owner.telegramUserId ||
        self.id !== record.connectedTelegramUserId
      )
        throw new AppError("IDENTITY_MISMATCH", "هویت session معتبر نیست.");
      await this.setMembership(
        rt,
        await this.io(rt, () => rt.client.membership()),
      );
      this.retry.delete(record.userId);
    } catch (error) {
      await this.runtimeFailure(rt, error);
    }
  }
  private async runtimeFailure(rt: Runtime, error: unknown) {
    rt.online = false;
    if (isRevoked(error) || rpcCode(error) === "IDENTITY_MISMATCH") {
      await this.store.disableSession(
        rt.userId,
        "REVOKED",
        "اعتبار اتصال تلگرام پایان یافته است؛ دوباره وارد شوید.",
        rt.revision,
      );
      await this.close(rt);
      await this.options.files.remove(rt.key);
      await this.store.updateSession(rt.userId, rt.revision, {
        storageKey: null,
      });
      workerLog.failure("telegram.session.revoked", error, {
        sessionRef: sessionRef(rt.userId),
      });
      void this.announce(
        rt.userId,
        "اتصال تلگرام باطل شد؛ درخواست‌های اجرا‌نشده لغو شدند.",
      );
    } else {
      await this.store.updateSession(rt.userId, rt.revision, {
        runtimeReady: false,
        lastError: safeError(error).message,
      });
      await this.close(rt);
      const count = (this.retry.get(rt.userId)?.count ?? 0) + 1;
      this.retry.set(rt.userId, {
        count,
        at: this.now() + Math.min(300_000, 5000 * 2 ** Math.min(count, 6)),
      });
      workerLog.failure("telegram.session.runtime_failed", error, {
        retryCount: count,
        retryInMs: Math.max(0, (this.retry.get(rt.userId)?.at ?? 0) - this.now()),
        sessionRef: sessionRef(rt.userId),
      });
    }
  }
  async checkForExecution(userId: string, revision: number): Promise<boolean> {
    const rt = this.runtimes.get(userId);
    const record = await this.store.session(userId);
    if (
      !rt?.online ||
      !record ||
      record.state !== "ACTIVE" ||
      rt.revision !== revision
    )
      return false;
    try {
      await this.authorize(userId);
      return await this.setMembership(
        rt,
        await this.io(rt, () => rt.client.membership()),
      );
    } catch (error) {
      await this.runtimeFailure(rt, error);
      return false;
    }
  }
  async sendReply(userId: string, messageId: number, text: string) {
    const rt = this.runtimes.get(userId);
    if (!rt?.online)
      throw new AppError("SESSION_NOT_READY", "اتصال آماده نیست.");
    return this.io(rt, () => rt.client.sendReply(messageId, text));
  }
  async command(
    userId: string,
    command: WorkerCommand,
  ): Promise<TelegramSessionStatus> {
    await this.authorize(userId);
    const cancelling =
      command.type === "cancel" &&
      this.challenges.get(userId)?.id === command.id;
    if (command.type === "status") return this.status(userId);
    if (command.type === "cancel") {
      const challenge = this.challenges.get(userId);
      if (challenge?.id === command.id) challenge.rt.abort.abort();
    }
    if (command.type === "revoke") {
      await this.store.disableSession(
        userId,
        "REVOKING",
        "قطع اتصال درخواست شده است؛ درخواست‌های اجرا‌نشده لغو شدند.",
      );
      this.challenges.get(userId)?.rt.abort.abort();
    }
    return this.serial(userId, async () => {
      const existing = this.challenges.get(userId);
      if (existing && existing.expires <= this.now())
        await this.discard(existing, "زمان ورود تمام شد؛ دوباره شروع کنید.");
      if (command.type === "login") {
        const current = this.challenges.get(userId);
        if (current) {
          if (current.phone !== command.phone)
            throw new AppError("LOGIN_EXISTS", "ابتدا ورود فعلی را لغو کنید.");
          return this.status(userId);
        }
        const previous = await this.store.session(userId);
        if (
          previous &&
          ["ACTIVE", "NOT_IN_GROUP", "REVOKING"].includes(previous.state)
        )
          throw new AppError(
            "SESSION_EXISTS",
            "برای ورود جدید ابتدا اتصال فعلی را قطع کنید.",
          );
        if (this.runtimes.size >= this.options.max)
          throw new AppError("CAPACITY", "ظرفیت اتصال‌ها تکمیل است.");
        const rateKeys = this.keys(userId, command.phone);
        await this.store.consumeSend(rateKeys, new Date(this.now()));
        if (previous?.storageKey)
          await this.options.files.remove(previous.storageKey);
        const record = await this.store.beginSession(
          userId,
          randomBytes(32).toString("hex"),
        );
        let rt: Runtime;
        try {
          rt = await this.open(record);
        } catch (error) {
          await this.store.updateSession(userId, record.revision, {
            state: "ERROR",
            storageKey: null,
            lastError: safeError(error).message,
          });
          throw error;
        }
        const expires = this.now() + LOGIN_TTL;
        const id = randomUUID();
        const challenge: Challenge = {
          id,
          rt,
          phone: command.phone,
          hash: "",
          attempts: 0,
          expires,
          rateKeys,
          public: {
            id,
            step: "VERIFYING",
            expiresAt: new Date(expires).toISOString(),
            resendAvailableAt: null,
            delivery: "app",
            codeLength: null,
            maskedPhone: `${command.phone.slice(0, 3)}••••${command.phone.slice(-4)}`,
            error: null,
          },
        };
        this.challenges.set(userId, challenge);
        try {
          const result = await this.io(rt, () =>
            rt.client.sendCode(command.phone, rt.abort.signal),
          );
          if ("account" in result)
            await this.accepted(challenge, result.account);
          else await this.applyCode(challenge, result.code);
        } catch (error) {
          await this.loginFailure(challenge, error);
        }
      } else if (command.type === "membership") {
        const record = await this.store.session(userId);
        if (!record || !["ACTIVE", "NOT_IN_GROUP"].includes(record.state))
          throw new AppError("NO_SESSION", "ابتدا وارد تلگرام شوید.");
        await this.recoverRuntime(record);
      } else if (command.type === "revoke") {
        await this.revoke(userId);
      } else {
        const challenge = this.challenges.get(userId);
        if (!challenge && cancelling) return this.status(userId);
        if (!challenge || challenge.id !== command.id)
          throw new AppError(
            "LOGIN_EXPIRED",
            "این ورود معتبر نیست؛ دوباره شروع کنید.",
            404,
          );
        if (
          command.type !== "cancel" &&
          challenge.blockedUntil &&
          challenge.blockedUntil > this.now()
        )
          throw new AppError(
            "RATE_LIMITED",
            "پس از زمان اعلام‌شده تلگرام دوباره تلاش کنید.",
            429,
            new Date(challenge.blockedUntil).toISOString(),
          );
        if (command.type === "cancel") {
          await this.discard(challenge, "ورود لغو شد.");
        } else
          try {
            if (command.type === "resend") {
              const at = challenge.public.resendAvailableAt;
              if (!at || Date.parse(at) > this.now())
                throw new AppError(
                  "RESEND_WAIT",
                  "هنوز امکان ارسال دوباره کد وجود ندارد.",
                  429,
                  at ?? undefined,
                );
              await this.store.consumeSend(
                challenge.rateKeys,
                new Date(this.now()),
              );
              const result = await this.io(challenge.rt, () =>
                challenge.rt.client.resendCode(
                  challenge.phone,
                  challenge.hash,
                  challenge.rt.abort.signal,
                ),
              );
              if ("account" in result)
                await this.accepted(challenge, result.account);
              else await this.applyCode(challenge, result.code);
            } else {
              if (
                (command.type === "code" && challenge.public.step !== "CODE") ||
                (command.type === "password" &&
                  challenge.public.step !== "PASSWORD")
              )
                throw new AppError(
                  "WRONG_STEP",
                  "مرحله ورود تغییر کرده است؛ وضعیت را تازه کنید.",
                );
              const account = await this.io(challenge.rt, () =>
                command.type === "code"
                  ? challenge.rt.client.signIn(
                      challenge.phone,
                      challenge.hash,
                      command.code,
                      challenge.rt.abort.signal,
                    )
                  : challenge.rt.client.password(
                      command.password,
                      challenge.rt.abort.signal,
                    ),
              );
              await this.accepted(challenge, account);
            }
          } catch (error) {
            await this.loginFailure(challenge, error);
          }
      }
      return this.status(userId);
    });
  }
  private async loginFailure(challenge: Challenge, error: unknown) {
    workerLog.diagnostic("telegram.login.failed", error, {
      loginPhase:
        challenge.public.step === "CODE"
          ? "sign_in"
          : challenge.public.step === "PASSWORD"
            ? "password"
            : "send_code_or_post_auth",
      sessionRef: sessionRef(challenge.rt.userId),
    });
    if (rpcCode(error) === "SESSION_PASSWORD_NEEDED") {
      challenge.public.step = "PASSWORD";
      challenge.public.error = null;
      return;
    }
    const safe = safeError(error);
    if (safe.retryAt) {
      challenge.blockedUntil = Date.parse(safe.retryAt);
      await this.store.blockLogin(challenge.rateKeys, new Date(safe.retryAt));
    }
    if (
      ["PHONE_CODE_INVALID", "PASSWORD_HASH_INVALID"].includes(rpcCode(error))
    )
      challenge.attempts++;
    const record = await this.store.session(challenge.rt.userId);
    if (record?.state === "REVOKING") throw safe;
    if (record?.connectedTelegramUserId) {
      this.challenges.delete(challenge.rt.userId);
      await this.store.activateSession(record.userId, record.revision, {
        state: "ACTIVE",
      });
      await this.runtimeFailure(challenge.rt, error);
    } else if (
      challenge.attempts >= 5 ||
      [
        "TIMEOUT",
        "CANCELLED",
        "PHONE_CODE_EXPIRED",
        "UNSUPPORTED_DELIVERY",
      ].includes(safe.code) ||
      challenge.public.step === "VERIFYING"
    )
      await this.discard(
        challenge,
        challenge.attempts >= 5
          ? "تعداد تلاش‌های ناموفق تمام شد؛ دوباره شروع کنید."
          : safe.message,
      );
    else challenge.public.error = safe.message;
    throw safe;
  }
  private async revoke(userId: string) {
    const challenge = this.challenges.get(userId);
    if (challenge) {
      await this.discard(challenge, "ورود لغو شد.");
      await this.store.disableSession(userId, "REVOKED", "اتصال قطع شد.");
      return;
    }
    const record = await this.store.session(userId);
    if (!record) return;
    if (!record.storageKey) {
      await this.store.disableSession(userId, "REVOKED", "اتصال قطع شد.");
      return;
    }
    const rt = await this.open(record);
    try {
      await this.io(rt, () => rt.client.logout());
    } catch (error) {
      if (!isRevoked(error)) {
        await this.close(rt);
        throw safeError(error);
      }
    }
    await this.close(rt);
    await this.options.files.remove(rt.key);
    await this.store.updateSession(userId, rt.revision, {
      state: "REVOKED",
      storageKey: null,
      runtimeReady: false,
      connectedTelegramUserId: null,
      lastError: null,
    });
  }
  async synchronize(): Promise<SynchronizeResult> {
    if (this.syncing || this.stopped)
      return { failures: 0, recoveryAttempts: 0, revocations: 0, scanned: 0 };
    this.syncing = true;
    try {
      const records = await this.store.sessions();
      let recoveryAttempts = 0;
      let revocations = 0;
      const results = await Promise.allSettled(
        records.map((record) =>
          this.serial(record.userId, async () => {
            if (
              !this.options.allowlist.has(record.user.telegramUserId) &&
              !["REVOKED", "ERROR"].includes(record.state)
            ) {
              await this.store.disableSession(
                record.userId,
                "REVOKING",
                "دسترسی این حساب لغو شده است.",
              );
              revocations++;
            }
            const current = await this.store.session(record.userId);
            if (!current) return;
            if (current.state === "REVOKING") {
              await this.revoke(current.userId);
              return;
            }
            const challenge = this.challenges.get(record.userId);
            if (challenge) {
              if (challenge.expires <= this.now())
                await this.discard(
                  challenge,
                  "زمان ورود تمام شد؛ دوباره شروع کنید.",
                );
              return;
            }
            if (current.state !== "ACTIVE") return;
            if ((this.retry.get(record.userId)?.at ?? 0) > this.now()) return;
            const rt = this.runtimes.get(record.userId);
            if (
              !rt ||
              !current.membershipCheckedAt ||
              this.now() - current.membershipCheckedAt.getTime() > 30_000
            ) {
              recoveryAttempts++;
              await this.recoverRuntime(current);
            } else
              await this.store.updateSession(record.userId, current.revision, {
                runtimeCheckedAt: new Date(this.now()),
                runtimeReady: rt.online,
              });
          }),
        ),
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      for (const [index, result] of results.entries())
        if (result.status === "rejected")
          workerLog.failure("telegram.session.sync_failed", result.reason, {
            sessionRef: sessionRef(records[index]!.userId),
          });
      return {
        failures: failures.length,
        recoveryAttempts,
        revocations,
        scanned: records.length,
      };
    } finally {
      this.syncing = false;
    }
  }
  async stop() {
    this.stopped = true;
    for (const c of this.challenges.values()) c.rt.abort.abort();
    await Promise.allSettled(this.locks.values());
    for (const rt of [...this.runtimes.values()]) {
      await this.store.updateSession(rt.userId, rt.revision, {
        runtimeReady: false,
      });
      await this.close(rt);
    }
  }
}
