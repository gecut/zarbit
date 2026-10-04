import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { SessionNotification } from "@zarbit/messages";
import { SessionOutages } from "./session-outages";
import {
  AppError,
  type LoginStatus,
  type TelegramSessionStatus,
  presentTelegramSession,
  TELEGRAM_CONTRACT_VERSION,
  type WorkerCommand,
} from "@zarbit/contracts";
import { safeError, rpcCode, isRevoked, errorDetails } from "./errors";
import { SessionFiles } from "./session-files";
import { challengeRef, sessionRef, workerLog } from "./logger";
import type {
  TelegramTransport,
  TransportFactory,
  Account,
  CodeDelivery,
  QuoteEvent,
  TelegramMutation,
  TelegramLifecycleEvent,
} from "./transport";

const LOGIN_TTL = 600_000;
const supportedDeliveries = new Set([
  "app",
  "sms",
  "call",
  "sms_word",
  "sms_phrase",
]);
const expiredLoginCodes = new Set([
  "PHONE_CODE_EXPIRED",
  "PHONE_CODE_HASH_EMPTY",
  "PHONE_CODE_HASH_INVALID",
  "LOGIN_EXPIRED",
]);
type SessionState =
  "PENDING_OTP" | "ACTIVE" | "NOT_IN_GROUP" | "REVOKING" | "REVOKED" | "ERROR";
interface SessionOwner {
  telegramUserId: string;
}
interface SessionRecord {
  userId: string;
  storageKey: string | null;
  connectedTelegramUserId: string | null;
  state: SessionState;
  revision: number;
  version?: number;
  loginId?: string | null;
  runtimeReady: boolean;
  runtimeCheckedAt: Date | null;
  membershipCheckedAt: Date | null;
  lastError: string | null;
  stateChangedAt?: Date;
  lastObservedAt?: Date;
  reasonCode?: string | null;
  lastErrorCode?: string | null;
  revokedAt?: Date | null;
  connectionState?: "CONNECTED" | "CONNECTING" | "OFFLINE" | "DEGRADED";
}
interface StoredSession extends SessionRecord {
  user: SessionOwner;
}
interface SessionUpdate {
  connectedTelegramUserId?: string | null;
  lastError?: string | null;
  membershipCheckedAt?: Date | null;
  runtimeCheckedAt?: Date | null;
  runtimeReady?: boolean;
  state?: SessionState;
  storageKey?: string | null;
  loginId?: string | null;
  reasonCode?: string | null;
  lastErrorCode?: string | null;
  revokedAt?: Date | null;
  connectionState?: "CONNECTED" | "CONNECTING" | "OFFLINE" | "DEGRADED";
}
interface Runtime {
  userId: string;
  key: string;
  revision: number;
  client: TelegramTransport;
  abort: AbortController;
  epoch: number;
  transportConnected: boolean;
  historyReady: boolean;
  canSend: boolean;
  online: boolean;
  operation?: string;
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
type LoginPhase =
  "password" | "post_auth" | "resend_code" | "send_code" | "sign_in";
export interface SessionOptions {
  groupId: number;
  quoteSenderId: string;
  max: number;
  secret: string;
  allowlist: Set<string>;
  files: SessionFiles;
  factory: TransportFactory;
  timeoutMs?: number;
  membershipTtlMs?: number;
  now?: () => number;
  notify?: (userId: string, event: SessionNotification) => Promise<void>;
}

export interface SynchronizeResult {
  failures: number;
  recoveryAttempts: number;
  revocations: number;
  scanned: number;
}

export interface SessionStore {
  finishTelegramCleanup(userId: string): Promise<unknown>;
  recoverTelegramOperations(): Promise<unknown>;
  pruneTelegramOperations(): Promise<unknown>;
  activeTelegramOperation(userId: string): Promise<{ id: string } | null>;
  activateSession(
    userId: string,
    revision: number,
    data: SessionUpdate,
  ): Promise<{ count: number }>;
  beginSession(
    userId: string,
    storageKey: string,
    loginId?: string,
  ): Promise<SessionRecord>;
  blockLogin(keys: string[], until: Date): Promise<unknown>;
  consumeSend(keys: string[], now: Date): Promise<unknown>;
  disableSession(
    userId: string,
    state: "NOT_IN_GROUP" | "REVOKING" | "REVOKED" | "ERROR",
    error: string,
    revision?: number,
    reasonCode?: string,
  ): Promise<boolean>;
  owner(userId: string): Promise<SessionOwner | null>;
  recover(): Promise<void>;
  session(userId: string): Promise<SessionRecord | null>;
  sessions(): Promise<StoredSession[]>;
  updateSession(
    userId: string,
    revision: number,
    data: SessionUpdate,
  ): Promise<{ count: number }>;
}

export class Sessions {
  private readonly outages = new SessionOutages();
  private readonly runtimes = new Map<string, Runtime>();
  private readonly challenges = new Map<string, Challenge>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly retry = new Map<string, { at: number; count: number }>();
  private syncing = false;
  private stopped = false;
  forceSend?: (userId: string, id: string) => Promise<void>;
  async requireConnected(userId: string) {
    await this.authorize(userId);
    const record = await this.store.session(userId);
    const rt = this.runtimes.get(userId);
    if (
      !record ||
      record.state !== "ACTIVE" ||
      !record.runtimeReady ||
      !rt?.canSend ||
      rt.abort.signal.aborted ||
      rt.revision !== record.revision
    )
      throw new AppError(
        "SESSION_REQUIRED",
        "ابتدا اتصال تلگرام را برقرار کنید.",
      );
    return rt;
  }
  async sendGroup(userId: string, text: string) {
    const rt = await this.requireConnected(userId);
    return rt.client.sendGroup(text);
  }
  onQuote?: (
    userId: string,
    revision: number,
    event: QuoteEvent,
  ) => Promise<void>;
  onMutation?: (event: TelegramMutation) => Promise<void>;
  onReady?: (userId: string, revision: number) => Promise<void>;
  async latestMessageId(): Promise<number> {
    const runtime = [...this.runtimes.values()].find(
      (rt) =>
        rt.historyReady &&
        !rt.abort.signal.aborted &&
        rt.client.latestMessageId,
    );
    if (!runtime?.client.latestMessageId)
      throw new Error("No active Telegram history session");
    return runtime.client.latestMessageId(this.options.groupId);
  }
  async history(
    afterMessageId: number,
    beforeMessageId: number,
  ): Promise<QuoteEvent[]> {
    const runtime = [...this.runtimes.values()].find(
      (rt) => rt.historyReady && !rt.abort.signal.aborted && rt.client.history,
    );
    if (!runtime?.client.history)
      throw new Error("No active Telegram history session");
    return runtime.client.history(
      this.options.groupId,
      afterMessageId,
      beforeMessageId,
    );
  }
  constructor(
    readonly store: SessionStore,
    private readonly options: SessionOptions,
  ) {}
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private async serial<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const queuedAt = this.now();
    const previous = this.locks.get(userId) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(work);
    this.locks.set(userId, pending);
    try {
      workerLog.debug("telegram.session.lock.acquired", {
        queueDelayMs: this.now() - queuedAt,
        sessionRef: sessionRef(userId),
      });
      return await pending;
    } finally {
      if (this.locks.get(userId) === pending) this.locks.delete(userId);
      workerLog.debug("telegram.session.lock.released", {
        sessionRef: sessionRef(userId),
      });
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
  async authorizeOwner(userId: string): Promise<void> {
    await this.authorize(userId);
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
    workerLog.info("telegram.session.runtime.opening", {
      revision: record.revision,
      runtimeCount: this.runtimes.size,
      sessionRef: sessionRef(record.userId),
    });
    await this.options.files.protect(record.storageKey);
    if (this.runtimes.size >= this.options.max)
      throw new AppError("CAPACITY", "ظرفیت اتصال‌ها تکمیل است.");
    // Reserve capacity before any network operation.
    const observe = (event: TelegramLifecycleEvent) =>
      this.observeTransport(record.userId, event);
    const rt: Runtime = {
      userId: record.userId,
      key: record.storageKey,
      revision: record.revision,
      client: this.options.factory(
        this.options.files.path(record.storageKey),
        observe,
      ),
      abort: new AbortController(),
      epoch: 0,
      transportConnected: false,
      historyReady: false,
      canSend: false,
      online: false,
    };
    this.runtimes.set(record.userId, rt);
    workerLog.info("telegram.session.runtime.opened", {
      revision: rt.revision,
      runtimeCount: this.runtimes.size,
      sessionRef: sessionRef(rt.userId),
    });
    return rt;
  }
  private observeTransport(userId: string, event: TelegramLifecycleEvent) {
    const rt = this.runtimes.get(userId);
    const context = {
      operation: rt?.operation ?? null,
      sessionRef: sessionRef(userId),
    };
    if (event.type === "connection_state") {
      workerLog.debug("telegram.connection.state_changed", {
        ...context,
        state: event.state,
      });
      if (
        event.state === "offline" ||
        event.state === "connecting" ||
        event.state === "updating"
      ) {
        if (rt) {
          rt.epoch++;
          rt.transportConnected = false;
          rt.historyReady = false;
          rt.canSend = false;
          rt.online = false;
        }
      } else if (event.state === "connected") {
        if (rt) {
          rt.transportConnected = true;
        }
        if (rt && !rt.canSend) {
          void this.serial(userId, async () => {
            if (
              this.runtimes.get(userId) !== rt ||
              rt.abort.signal.aborted ||
              rt.canSend
            )
              return;
            const record = await this.store.session(userId);
            if (record && record.state === "ACTIVE") {
              await this.recoverRuntime(record);
            }
          }).catch((error: unknown) =>
            workerLog.failure("telegram.session.reconnect_failed", error, {
              sessionRef: sessionRef(userId),
            }),
          );
        }
      }
    } else if (event.type === "connection_dc") {
      workerLog.debug("telegram.connection.dc_selected", {
        ...context,
        dcId: event.dcId,
      });
    } else {
      workerLog.failure("telegram.client.error", event.error, {
        ...context,
        source: event.source,
      });
      if (rt) {
        rt.epoch++;
        rt.transportConnected = false;
        rt.historyReady = false;
        rt.canSend = false;
        rt.online = false;
        void this.serial(userId, async () => {
          if (this.runtimes.get(userId) !== rt || rt.abort.signal.aborted)
            return;
          await this.runtimeFailure(rt, event.error);
        }).catch((error) =>
          workerLog.failure("telegram.session.lifecycle_failed", error, {
            sessionRef: sessionRef(userId),
          }),
        );
      }
    }
  }
  private async close(rt: Runtime, reason = "normal") {
    const startedAt = this.now();
    rt.epoch++;
    rt.transportConnected = false;
    rt.historyReady = false;
    rt.canSend = false;
    rt.online = false;
    rt.stop?.();
    rt.abort.abort();
    workerLog.info("telegram.session.runtime.closing", {
      operation: rt.operation ?? null,
      reason,
      sessionRef: sessionRef(rt.userId),
    });
    await (rt.closing ??= rt.client.close());
    if (this.runtimes.get(rt.userId) === rt) this.runtimes.delete(rt.userId);
    workerLog.info("telegram.session.runtime.closed", {
      durationMs: this.now() - startedAt,
      reason,
      runtimeCount: this.runtimes.size,
      sessionRef: sessionRef(rt.userId),
    });
  }
  private async io<T>(
    rt: Runtime,
    operation: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (rt.abort.signal.aborted)
      throw new AppError("CANCELLED", "عملیات ورود لغو شد.");
    const startedAt = this.now();
    const previousOperation = rt.operation;
    rt.operation = operation;
    workerLog.info("telegram.operation.started", {
      operation,
      sessionRef: sessionRef(rt.userId),
      timeoutMs: this.options.timeoutMs ?? 20_000,
    });
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
      workerLog.info("telegram.operation.completed", {
        durationMs: this.now() - startedAt,
        operation,
        sessionRef: sessionRef(rt.userId),
      });
      return result;
    } catch (error) {
      workerLog.failure("telegram.operation.failed", error, {
        durationMs: this.now() - startedAt,
        operation,
        sessionRef: sessionRef(rt.userId),
      });
      if (error instanceof AppError && error.code === "TIMEOUT")
        await this.close(rt, "timeout");
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (abortListener)
        rt.abort.signal.removeEventListener("abort", abortListener);
      rt.operation = previousOperation;
    }
  }
  private async announce(
    userId: string,
    event: SessionNotification,
  ): Promise<boolean> {
    const startedAt = this.now();
    try {
      if (!this.options.notify) return false;
      await this.options.notify(userId, event);
      workerLog.info("telegram.notification.completed", {
        durationMs: this.now() - startedAt,
        kind: event.type,
        sessionRef: sessionRef(userId),
      });
      return true;
    } catch (error) {
      workerLog.failure("telegram.notification.failed", error, {
        durationMs: this.now() - startedAt,
        sessionRef: sessionRef(userId),
      });
      return false;
    }
  }
  async initialize() {
    await this.options.files.prepare();
    await this.store.recover();
    await this.store.recoverTelegramOperations();
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
  runtimeHealth() {
    return {
      activeSessions: [...this.runtimes.values()].filter(
        (runtime) => runtime.canSend,
      ).length,
      reservedSessions: this.runtimes.size,
      remainingCapacity: Math.max(0, this.options.max - this.runtimes.size),
    };
  }
  async status(userId: string): Promise<TelegramSessionStatus> {
    const record = await this.store.session(userId);
    const rt = this.runtimes.get(userId);
    const challenge = this.challenges.get(userId);
    const activeOperation = await this.store.activeTelegramOperation(userId);
    const observedAt = new Date(this.now()).toISOString();
    const stopping = record?.state === "REVOKING";
    const login =
      !stopping && challenge && challenge.expires > this.now()
        ? challenge.public
        : null;
    const authorization = stopping
      ? "REVOKING"
      : login
        ? "LOGIN_PENDING"
        : !record
          ? "DISCONNECTED"
          : record.state === "REVOKED"
            ? "REVOKED"
            : record.connectedTelegramUserId
              ? "AUTHORIZED"
              : record.reasonCode === "LOGIN_CANCELLED" ||
                  record.state === "PENDING_OTP"
                ? "DISCONNECTED"
                : "ERROR";
    const ready =
      record?.state === "ACTIVE" &&
      record.runtimeReady &&
      rt?.canSend &&
      !rt.abort.signal.aborted &&
      rt.revision === record.revision;
    const retryAt =
      login?.retryAt ??
      (this.retry.get(userId)?.at
        ? new Date(this.retry.get(userId)!.at).toISOString()
        : null);
    return presentTelegramSession(
      {
        contractVersion: TELEGRAM_CONTRACT_VERSION,
        authorization,
        worker: "AVAILABLE",
        source: "LIVE",
        connection: ready
          ? "CONNECTED"
          : rt?.transportConnected
            ? "CONNECTING"
            : "OFFLINE",
        membership:
          record?.state === "NOT_IN_GROUP"
            ? "NOT_MEMBER"
            : record?.membershipCheckedAt && record.connectedTelegramUserId
              ? "MEMBER"
              : "UNKNOWN",
        revision: record?.revision ?? 0,
        version: record?.version ?? 0,
        observedAt,
        stateChangedAt: record?.stateChangedAt?.toISOString() ?? observedAt,
        retryAt,
        activeOperationId: activeOperation?.id ?? null,
        challengeId: stopping ? null : (record?.loginId ?? login?.id ?? null),
        groupId: this.options.groupId,
        quoteSenderId: this.options.quoteSenderId,
        connectedTelegramUserId: record?.connectedTelegramUserId ?? null,
        membershipCheckedAt: record?.membershipCheckedAt?.toISOString() ?? null,
        login,
        issue: record?.lastError
          ? {
              code: record.reasonCode ?? "UNKNOWN_FAILURE",
              message: record.lastError,
            }
          : null,
      },
      this.now(),
    );
  }
  abortLogin(userId: string): void {
    this.runtimes.get(userId)?.abort.abort();
  }
  private async discard(challenge: Challenge, message: string) {
    if (this.challenges.get(challenge.rt.userId) !== challenge) return;
    workerLog.info("telegram.login.discarding", {
      challengeRef: challengeRef(challenge.id),
      loginPhase: challenge.public.step,
      sessionRef: sessionRef(challenge.rt.userId),
    });
    this.challenges.delete(challenge.rt.userId);
    await this.close(challenge.rt, "login_discarded");
    if ((await this.store.session(challenge.rt.userId))?.state === "REVOKING")
      return;
    await this.options.files.remove(challenge.rt.key);
    await this.store.updateSession(challenge.rt.userId, challenge.rt.revision, {
      state: "ERROR",
      storageKey: null,
      runtimeReady: false,
      lastError: message === "ورود لغو شد." ? null : message,
      loginId: null,
      reasonCode:
        message === "ورود لغو شد." ? "LOGIN_CANCELLED" : "LOGIN_EXPIRED",
    });
    workerLog.info("telegram.login.discarded", {
      challengeRef: challengeRef(challenge.id),
      sessionRef: sessionRef(challenge.rt.userId),
      state: "ERROR",
    });
  }
  private async applyCode(challenge: Challenge, code: CodeDelivery) {
    if (!supportedDeliveries.has(code.type))
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
    workerLog.info("telegram.login.code_requested", {
      canResend: code.canResend,
      challengeRef: challengeRef(challenge.id),
      codeLength: code.length,
      delivery: code.type,
      sessionRef: sessionRef(challenge.rt.userId),
    });
  }
  private async accepted(challenge: Challenge, account: Account) {
    const rt = challenge.rt;
    const owner = await this.authorize(rt.userId);
    if (account.id !== owner.telegramUserId) {
      workerLog.warn("telegram.login.identity_mismatch", {
        challengeRef: challengeRef(challenge.id),
        sessionRef: sessionRef(rt.userId),
      });
      try {
        await this.io(rt, "logout", () => rt.client.logout());
      } catch {
        this.challenges.delete(rt.userId);
        await this.store.disableSession(
          rt.userId,
          "REVOKING",
          "حساب متفاوت رد شد؛ در حال ابطال اتصال هستیم.",
          rt.revision,
          "IDENTITY_MISMATCH",
        );
        await this.close(rt, "identity_mismatch");
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
    challenge.public.step = "VERIFYING_CODE";
    workerLog.info("telegram.login.authorized", {
      challengeRef: challengeRef(challenge.id),
      sessionRef: sessionRef(rt.userId),
    });
    await this.options.files.protect(rt.key);
    const identitySaved = await this.store.activateSession(
      rt.userId,
      rt.revision,
      {
        connectedTelegramUserId: account.id,
      },
    );
    if (!identitySaved.count)
      throw new AppError("CANCELLED", "ورود لغو شده است.");
    const member = await this.io(rt, "membership", () =>
      rt.client.membership(),
    );
    // Membership errors after authorization retain the session for a safe retry.
    const activated = await this.store.activateSession(rt.userId, rt.revision, {
      state: "ACTIVE",
      loginId: null,
      lastError: null,
    });
    this.challenges.delete(rt.userId);
    if (!activated.count) return;
    await this.setMembership(rt, member);
    void this.announce(rt.userId, { type: "connected", member });
  }
  private async setMembership(rt: Runtime, member: boolean) {
    workerLog.info("telegram.membership.checked", {
      isMember: member,
      sessionRef: sessionRef(rt.userId),
    });
    if (!member) {
      this.outages.clear(rt.userId);
      const wasActive = (await this.store.session(rt.userId))?.runtimeReady;
      await this.store.disableSession(
        rt.userId,
        "NOT_IN_GROUP",
        "عضویت در گروه معامله تأیید نشد؛ وضعیت درخواست‌های خود را بررسی کنید.",
        rt.revision,
        "GROUP_MEMBERSHIP_REQUIRED",
      );
      await this.store.updateSession(rt.userId, rt.revision, {
        membershipCheckedAt: new Date(this.now()),
        connectionState: "OFFLINE",
        reasonCode: "GROUP_MEMBERSHIP_REQUIRED",
      });
      await this.close(rt, "not_in_group");
      if (wasActive) void this.announce(rt.userId, { type: "membership_lost" });
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
    if (!rt.stop)
      rt.stop = await this.io(rt, "subscribe", () =>
        rt.client.subscribe(
          (event) => {
            void this.serial(rt.userId, async () => {
              if (this.runtimes.get(rt.userId) === rt && !this.stopped)
                await this.onQuote?.(rt.userId, rt.revision, event);
            }).catch((error) =>
              workerLog.failure("telegram.quote.processing_failed", error, {
                sessionRef: sessionRef(rt.userId),
              }),
            );
          },
          (event) => {
            void this.serial(rt.userId, async () => {
              if (this.runtimes.get(rt.userId) === rt && !this.stopped)
                await this.onMutation?.(event);
            }).catch((error) =>
              workerLog.failure("telegram.mutation.processing_failed", error, {
                sessionRef: sessionRef(rt.userId),
              }),
            );
          },
        ),
      );
    rt.transportConnected = true;
    rt.historyReady = true;
    const currentEpoch = rt.epoch;
    if (this.onReady) {
      try {
        await this.onReady(rt.userId, rt.revision);
      } catch (error) {
        workerLog.failure("telegram.financial_recovery.failed", error, {
          sessionRef: sessionRef(rt.userId),
        });
        return false;
      }
    }
    if (
      this.runtimes.get(rt.userId) !== rt ||
      rt.abort.signal.aborted ||
      rt.epoch !== currentEpoch ||
      !rt.transportConnected
    ) {
      workerLog.warn("telegram.session.ready_aborted_due_to_state_change", {
        sessionRef: sessionRef(rt.userId),
        epoch: rt.epoch,
        currentEpoch,
        transportConnected: rt.transportConnected,
      });
      return false;
    }
    const activated = await this.store.activateSession(rt.userId, rt.revision, {
      state: "ACTIVE",
      runtimeReady: true,
      runtimeCheckedAt: new Date(this.now()),
      membershipCheckedAt: new Date(this.now()),
      connectionState: "CONNECTED",
      reasonCode: null,
      lastError: null,
    });
    if (!activated.count) {
      rt.stop?.();
      rt.stop = undefined;
      return false;
    }
    rt.canSend = true;
    rt.online = true;
    if (this.outages.connected(rt.userId, rt.revision)) {
      workerLog.info("telegram.session.recovered", {
        reasonCode: "NONE",
        sessionRef: sessionRef(rt.userId),
      });
      await this.announce(rt.userId, { type: "recovered" });
    }
    workerLog.info("telegram.session.active", {
      revision: rt.revision,
      sessionRef: sessionRef(rt.userId),
    });
    return true;
  }
  private async recoverRuntime(record: SessionRecord) {
    workerLog.info("telegram.session.recovery.started", {
      revision: record.revision,
      sessionRef: sessionRef(record.userId),
    });
    const rt = await this.open(record);
    try {
      const self = await this.io(rt, "get_me", () => rt.client.getMe());
      const owner = await this.authorize(record.userId);
      if (
        self.id !== owner.telegramUserId ||
        self.id !== record.connectedTelegramUserId
      )
        throw new AppError("IDENTITY_MISMATCH", "هویت session معتبر نیست.");
      await this.setMembership(
        rt,
        await this.io(rt, "membership", () => rt.client.membership()),
      );
      this.retry.delete(record.userId);
      workerLog.info("telegram.session.recovery.completed", {
        revision: record.revision,
        sessionRef: sessionRef(record.userId),
      });
    } catch (error) {
      await this.runtimeFailure(rt, error);
      throw error;
    }
  }
  private async runtimeFailure(rt: Runtime, error: unknown) {
    rt.epoch++;
    rt.transportConnected = false;
    rt.historyReady = false;
    rt.canSend = false;
    rt.online = false;
    if (
      error instanceof AppError &&
      ["IDENTITY_MISMATCH", "FORBIDDEN"].includes(error.code)
    ) {
      await this.store.disableSession(
        rt.userId,
        "REVOKING",
        safeError(error).message,
        rt.revision,
        error.code,
      );
      await this.close(rt, "identity_rejected");
      await this.revoke(rt.userId);
      return;
    }
    if (
      isRevoked(error) ||
      (error instanceof AppError && error.code === "IDENTITY_MISMATCH")
    ) {
      this.outages.clear(rt.userId);
      await this.store.disableSession(
        rt.userId,
        "REVOKED",
        "اعتبار اتصال تلگرام پایان یافته است؛ دوباره وارد شوید.",
        rt.revision,
        (error instanceof AppError ? error.code : rpcCode(error)) ??
          "TELEGRAM_LOGGED_OUT",
      );
      await this.close(rt, "session_revoked");
      await this.options.files.remove(rt.key);
      await this.store.updateSession(rt.userId, rt.revision, {
        state: "REVOKED",
        storageKey: null,
        connectedTelegramUserId: null,
        loginId: null,
        reasonCode:
          (error instanceof AppError ? error.code : rpcCode(error)) ??
          "TELEGRAM_LOGGED_OUT",
        lastErrorCode: rpcCode(error),
        revokedAt: new Date(this.now()),
        connectionState: "OFFLINE",
      });
      workerLog.failure("telegram.session.revoked", error, {
        sessionRef: sessionRef(rt.userId),
      });
      void this.announce(rt.userId, { type: "revoked" });
    } else {
      this.outages.failed(rt.userId, rt.revision, this.now());
      await this.store.updateSession(rt.userId, rt.revision, {
        runtimeReady: false,
        lastError: safeError(error).message,
        reasonCode:
          errorDetails(error).failureCategory === "network" ||
          (error instanceof AppError && error.code === "TIMEOUT")
            ? "NETWORK_UNAVAILABLE"
            : "UNKNOWN_FAILURE",
        lastErrorCode: rpcCode(error),
        connectionState: "DEGRADED",
      });
      await this.close(rt, "runtime_failure");
      const count = (this.retry.get(rt.userId)?.count ?? 0) + 1;
      const safe = safeError(error);
      const retryAtFromSafe = safe.retryAt ? Date.parse(safe.retryAt) : NaN;
      const baseDelay = Math.min(300_000, 5000 * 2 ** Math.min(count, 6));
      const retryAt = !isNaN(retryAtFromSafe)
        ? Math.max(this.now() + baseDelay, retryAtFromSafe)
        : this.now() + baseDelay;
      this.retry.set(rt.userId, {
        count,
        at: retryAt,
      });
      workerLog.failure("telegram.session.runtime_failed", error, {
        retryCount: count,
        retryInMs: Math.max(
          0,
          (this.retry.get(rt.userId)?.at ?? 0) - this.now(),
        ),
        sessionRef: sessionRef(rt.userId),
      });
      workerLog.warn("telegram.session.degraded", {
        reasonCode: "NETWORK_UNAVAILABLE",
        retryAt: this.retry.get(rt.userId)?.at
          ? new Date(this.retry.get(rt.userId)!.at).toISOString()
          : null,
        sessionRef: sessionRef(rt.userId),
      });
    }
  }
  private async commandAttempt<T>(
    userId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.serial(userId, async () => {
      const timer = setTimeout(() => this.abortLogin(userId), 60_000);
      try {
        return await work();
      } finally {
        clearTimeout(timer);
      }
    });
  }
  async command(
    userId: string,
    command: WorkerCommand,
    operationId?: string,
  ): Promise<TelegramSessionStatus> {
    await this.authorize(userId);
    if (command.type !== "status")
      workerLog.info("telegram.command.received", {
        command: command.type,
        ...("id" in command ? { challengeRef: challengeRef(command.id) } : {}),
        sessionRef: sessionRef(userId),
      });
    const cancelling =
      command.type === "cancel" &&
      this.challenges.get(userId)?.id === command.id;
    if (command.type === "status") return this.status(userId);
    if (command.type === "force-send") {
      if (!this.forceSend)
        throw new AppError("UNAVAILABLE", "سرویس اجرا در دسترس نیست.", 503);
      await this.forceSend(userId, command.id);
      return this.status(userId);
    }
    if (command.type === "cancel") {
      const challenge = this.challenges.get(userId);
      if (challenge?.id === command.id) challenge.rt.abort.abort();
    }
    if (command.type === "revoke") {
      this.outages.clear(userId);
      if ((await this.store.session(userId))?.state !== "REVOKING")
        await this.store.disableSession(
          userId,
          "REVOKING",
          "قطع اتصال درخواست شده است؛ وضعیت درخواست‌های خود را بررسی کنید.",
        );
      this.challenges.get(userId)?.rt.abort.abort();
    }
    return this.commandAttempt(userId, async () => {
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
          ((previous.state !== "REVOKED" && previous.connectedTelegramUserId) ||
            ["ACTIVE", "NOT_IN_GROUP", "REVOKING"].includes(previous.state))
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
          operationId,
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
        const id = operationId ?? randomUUID();
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
            step: "SENDING_CODE",
            retryAt: null,
            expiresAt: new Date(expires).toISOString(),
            resendAvailableAt: null,
            delivery: "app",
            codeLength: null,
            maskedPhone: `${command.phone.slice(0, 3)}••••${command.phone.slice(-4)}`,
            error: null,
          },
        };
        this.challenges.set(userId, challenge);
        workerLog.info("telegram.login.started", {
          challengeRef: challengeRef(challenge.id),
          expiresInMs: LOGIN_TTL,
          sessionRef: sessionRef(userId),
        });
        try {
          const result = await this.io(rt, "send_code", () =>
            rt.client.sendCode(command.phone, rt.abort.signal),
          );
          if ("account" in result)
            await this.accepted(challenge, result.account);
          else await this.applyCode(challenge, result.code);
        } catch (error) {
          await this.loginFailure(challenge, error, "send_code");
        }
      } else if (command.type === "membership") {
        const record = await this.store.session(userId);
        if (!record || !["ACTIVE", "NOT_IN_GROUP"].includes(record.state))
          throw new AppError("NO_SESSION", "ابتدا وارد تلگرام شوید.");
        await this.recoverRuntime(record);
      } else if (
        command.type === "revoke" ||
        (command.type === "cancel" &&
          (await this.store.session(userId))?.state === "REVOKING")
      ) {
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
              const result = await this.io(challenge.rt, "resend_code", () =>
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
              challenge.public.step =
                command.type === "code"
                  ? "VERIFYING_CODE"
                  : "VERIFYING_PASSWORD";
              const account = await this.io(
                challenge.rt,
                command.type === "code" ? "sign_in" : "password",
                () =>
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
            await this.loginFailure(
              challenge,
              error,
              command.type === "resend"
                ? "resend_code"
                : command.type === "password"
                  ? "password"
                  : [
                        "SENDING_CODE",
                        "VERIFYING_CODE",
                        "VERIFYING_PASSWORD",
                      ].includes(challenge.public.step)
                    ? "post_auth"
                    : "sign_in",
            );
          }
      }
      return this.status(userId);
    });
  }
  private async loginFailure(
    challenge: Challenge,
    error: unknown,
    loginPhase: LoginPhase,
  ) {
    workerLog.failure("telegram.login.failed", error, {
      attempts: challenge.attempts,
      challengeRef: challengeRef(challenge.id),
      loginPhase,
      sessionRef: sessionRef(challenge.rt.userId),
    });
    if (rpcCode(error) === "SESSION_PASSWORD_NEEDED") {
      challenge.public.step = "PASSWORD";
      challenge.public.error = null;
      workerLog.info("telegram.login.password_required", {
        challengeRef: challengeRef(challenge.id),
        sessionRef: sessionRef(challenge.rt.userId),
      });
      return;
    }
    const safe = safeError(error);
    if (
      loginPhase !== "send_code" &&
      [
        "PHONE_CODE_INVALID",
        "PASSWORD_HASH_INVALID",
        "RATE_LIMITED",
        "RESEND_WAIT",
      ].includes(safe.code)
    )
      challenge.public.step = loginPhase === "password" ? "PASSWORD" : "CODE";
    if (safe.retryAt) {
      challenge.blockedUntil = Date.parse(safe.retryAt);
      challenge.public.retryAt = safe.retryAt;
      await this.store.blockLogin(challenge.rateKeys, new Date(safe.retryAt));
    }
    if (
      ["PHONE_CODE_INVALID", "PASSWORD_HASH_INVALID"].includes(
        rpcCode(error) ?? "",
      )
    )
      challenge.attempts++;
    const record = await this.store.session(challenge.rt.userId);
    if (record?.state === "REVOKING") {
      this.challenges.delete(challenge.rt.userId);
      await this.close(challenge.rt, "cancel_requested");
      throw safe;
    }
    if (record?.connectedTelegramUserId) {
      this.challenges.delete(challenge.rt.userId);
      await this.store.activateSession(record.userId, record.revision, {
        state: "ACTIVE",
        loginId: null,
      });
      await this.runtimeFailure(challenge.rt, error);
    } else if (
      (["TIMEOUT", "CANCELLED"].includes(safe.code) ||
        ["network", "unknown", "database"].includes(
          errorDetails(error).failureCategory,
        )) &&
      ["SENDING_CODE", "VERIFYING_CODE", "VERIFYING_PASSWORD"].includes(
        challenge.public.step,
      )
    ) {
      this.challenges.delete(challenge.rt.userId);
      await this.store.disableSession(
        challenge.rt.userId,
        "REVOKING",
        "نتیجه ورود مشخص نیست؛ اتصال در حال پاک‌سازی است.",
        challenge.rt.revision,
        "LOGIN_INTERRUPTED",
      );
      await this.close(challenge.rt, "authorization_uncertain");
    } else if (
      challenge.attempts >= 5 ||
      ["TIMEOUT", "CANCELLED", "UNSUPPORTED_DELIVERY"].includes(safe.code) ||
      expiredLoginCodes.has(rpcCode(error) ?? safe.code) ||
      isRevoked(error) ||
      ["SENDING_CODE", "VERIFYING_CODE", "VERIFYING_PASSWORD"].includes(
        challenge.public.step,
      )
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
    this.outages.clear(userId);
    const challenge = this.challenges.get(userId);
    if (challenge) {
      this.challenges.delete(userId);
      await this.close(challenge.rt, "cleanup_requested");
    }
    const record = await this.store.session(userId);
    if (!record) return;
    if (record.storageKey) {
      const existing = this.runtimes.get(userId);
      if (existing?.abort.signal.aborted)
        await this.close(existing, "cleanup_reopen");
      const rt = await this.open(record);
      try {
        await this.io(rt, "logout", () => rt.client.logout());
      } catch (error) {
        if (!isRevoked(error)) {
          await this.close(rt, "logout_failed");
          const count = (this.retry.get(userId)?.count ?? 0) + 1;
          const safe = safeError(error);
          const retryAtFromSafe = safe.retryAt ? Date.parse(safe.retryAt) : NaN;
          const baseDelay = Math.min(300_000, 5000 * 2 ** Math.min(count, 6));
          const retryAt = !isNaN(retryAtFromSafe)
            ? Math.max(this.now() + baseDelay, retryAtFromSafe)
            : this.now() + baseDelay;
          this.retry.set(userId, {
            count,
            at: retryAt,
          });
          throw safe;
        }
      }
      await this.close(rt, "logout_completed");
      await this.options.files.remove(rt.key);
    }
    const result = await this.store.updateSession(userId, record.revision, {
      state: "REVOKED",
      storageKey: null,
      loginId: null,
      runtimeReady: false,
      connectedTelegramUserId: null,
      lastError: null,
      connectionState: "OFFLINE",
      reasonCode: record.reasonCode ?? "USER_DISCONNECTED",
      revokedAt: new Date(this.now()),
    });
    if (result.count) await this.store.finishTelegramCleanup(userId);
    this.retry.delete(userId);
  }
  async synchronize(): Promise<SynchronizeResult> {
    if (this.syncing || this.stopped)
      return { failures: 0, recoveryAttempts: 0, revocations: 0, scanned: 0 };
    this.syncing = true;
    try {
      await this.store.pruneTelegramOperations();
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
              if ((this.retry.get(record.userId)?.at ?? 0) > this.now()) return;
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
            if (current.state !== "ACTIVE") {
              this.outages.clear(record.userId);
              return;
            }
            await this.outages.check(
              record.userId,
              current.revision,
              this.now(),
              () => this.announce(record.userId, { type: "outage" }),
            );
            if ((this.retry.get(record.userId)?.at ?? 0) > this.now()) return;
            const rt = this.runtimes.get(record.userId);
            const membershipTtl = this.options.membershipTtlMs ?? 15 * 60_000;
            const needsRecovery =
              !rt ||
              !rt.canSend ||
              !current.membershipCheckedAt ||
              this.now() - current.membershipCheckedAt.getTime() >
                membershipTtl;
            if (needsRecovery) {
              recoveryAttempts++;
              await this.recoverRuntime(current);
            } else if (current.runtimeReady !== rt.canSend) {
              await this.store.updateSession(record.userId, current.revision, {
                runtimeCheckedAt: new Date(this.now()),
                runtimeReady: rt.canSend,
              });
            }
          }),
        ),
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
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
