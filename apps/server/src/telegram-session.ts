import { randomBytes } from "node:crypto";
import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { TelegramClient } from "@mtcute/node";
import {
  TelegramSessionState,
  activateTelegramSession,
  beginTelegramSession,
  getTelegramSessionForUser,
  listActiveTelegramSessions,
  markTelegramSessionState,
} from "@zarbit/db";
import { env } from "@zarbit/env/server";
import QRCode from "qrcode";

import { sendPrivateNotification } from "./telegram.js";

const CHALLENGE_TTL_MS = 3 * 60 * 1_000;

interface LoginChallenge {
  userId: string;
  storageKey: string;
  client: TelegramClient;
  startedAt: Date;
  expiresAt: Date | null;
  qrImage: string | null;
  startPromise: Promise<void>;
  expiryTimer: ReturnType<typeof setTimeout>;
}

export interface TelegramSessionDto {
  state: TelegramSessionState | "DISCONNECTED";
  membershipCheckedAt: Date | null;
  lastError: string | null;
  stateChangedAt: Date | null;
  qrImage: string | null;
  qrExpiresAt: Date | null;
}

const challenges = new Map<string, LoginChallenge>();

async function notifySessionUser(telegramUserId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await sendPrivateNotification(env.TELEGRAM_BOT_TOKEN, telegramUserId, text).catch(() => undefined);
}

function ensureConfiguration(): void {
  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH || !env.TELEGRAM_GROUP_ID) {
    throw new Error("اتصال تلگرام روی سرور پیکربندی نشده است.");
  }
}

function storagePath(storageKey: string): string {
  return path.join(env.TELEGRAM_SESSIONS_DIR, `${storageKey}.sqlite`);
}

async function removeSessionFiles(storageKey: string): Promise<void> {
  const filename = storagePath(storageKey);
  await Promise.all([filename, `${filename}-wal`, `${filename}-shm`].map((target) => rm(target, { force: true })));
}

async function stopChallenge(challenge: LoginChallenge, removeStorage: boolean): Promise<void> {
  challenges.delete(challenge.userId);
  clearTimeout(challenge.expiryTimer);
  await challenge.client.destroy().catch(() => undefined);
  if (removeStorage) await removeSessionFiles(challenge.storageKey);
}

function isChallengeExpired(challenge: LoginChallenge): boolean {
  return Date.now() - challenge.startedAt.getTime() >= CHALLENGE_TTL_MS;
}

async function expireChallenge(challenge: LoginChallenge): Promise<void> {
  await stopChallenge(challenge, true);
  await markTelegramSessionState({
    userId: challenge.userId,
    state: TelegramSessionState.ERROR,
    error: "مهلت اتصال با QR تمام شد. دوباره تلاش کنید.",
  });
}

function challengeDto(challenge: LoginChallenge): TelegramSessionDto {
  return {
    state: TelegramSessionState.PENDING_QR,
    membershipCheckedAt: null,
    lastError: null,
    stateChangedAt: challenge.startedAt,
    qrImage: challenge.qrImage,
    qrExpiresAt: challenge.expiresAt,
  };
}

function sessionDto(session: Awaited<ReturnType<typeof getTelegramSessionForUser>>): TelegramSessionDto {
  if (!session) {
    return {
      state: "DISCONNECTED",
      membershipCheckedAt: null,
      lastError: null,
      stateChangedAt: null,
      qrImage: null,
      qrExpiresAt: null,
    };
  }
  return {
    state: session.state,
    membershipCheckedAt: session.membershipCheckedAt,
    lastError: session.lastError,
    stateChangedAt: session.stateChangedAt,
    qrImage: null,
    qrExpiresAt: null,
  };
}

export async function getTelegramSessionStatus(userId: string): Promise<TelegramSessionDto> {
  const challenge = challenges.get(userId);
  if (challenge) {
    if (isChallengeExpired(challenge)) {
      await expireChallenge(challenge);
    } else {
      return challengeDto(challenge);
    }
  }
  return sessionDto(await getTelegramSessionForUser(userId));
}

async function verifyMembership(client: TelegramClient): Promise<boolean> {
  ensureConfiguration();
  return Boolean(await client.getChatMember({ chatId: env.TELEGRAM_GROUP_ID!, userId: "self" }));
}

function qrReady(challenge: LoginChallenge): Promise<void> {
  if (challenge.qrImage) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error("QR تلگرام در زمان مورد انتظار آماده نشد."));
    }, 10_000);
    const timer = setInterval(() => {
      if (challenge.qrImage) {
        clearTimeout(timeout);
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

export async function createTelegramQrChallenge(input: { userId: string; telegramUserId: string }): Promise<TelegramSessionDto> {
  ensureConfiguration();
  const existing = challenges.get(input.userId);
  if (existing && !isChallengeExpired(existing)) return challengeDto(existing);
  if (existing) await expireChallenge(existing);

  const session = await getTelegramSessionForUser(input.userId);
  if (session?.state === TelegramSessionState.ACTIVE) {
    throw new Error("ابتدا نشست فعال تلگرام را قطع کنید.");
  }
  const activeSessions = await listActiveTelegramSessions();
  if (activeSessions.length >= env.MAX_TELEGRAM_SESSIONS) {
    throw new Error("ظرفیت اتصال هم‌زمان تکمیل است. بعداً دوباره تلاش کنید.");
  }

  const storageKey = randomBytes(32).toString("hex");
  await mkdir(env.TELEGRAM_SESSIONS_DIR, { recursive: true, mode: 0o700 });
  await chmod(env.TELEGRAM_SESSIONS_DIR, 0o700);
  await beginTelegramSession(input.userId, storageKey);

  const challenge = {} as LoginChallenge;
  const client = new TelegramClient({
    apiId: env.TELEGRAM_API_ID!,
    apiHash: env.TELEGRAM_API_HASH!,
    storage: storagePath(storageKey),
  });

  challenge.userId = input.userId;
  challenge.storageKey = storageKey;
  challenge.client = client;
  challenge.startedAt = new Date();
  challenge.expiresAt = null;
  challenge.qrImage = null;
  challenge.expiryTimer = setTimeout(() => {
    if (challenges.get(input.userId) === challenge && isChallengeExpired(challenge)) {
      void expireChallenge(challenge);
    }
  }, CHALLENGE_TTL_MS);
  challenge.expiryTimer.unref();
  challenges.set(input.userId, challenge);

  challenge.startPromise = client.start({
    qrCodeHandler: (url, expires) => {
      if (challenges.get(input.userId) !== challenge || isChallengeExpired(challenge)) return;
      challenge.expiresAt = expires;
      QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 280 })
        .then((image) => { challenge.qrImage = image; })
        .catch(() => undefined);
    },
  }).then(async (self) => {
    if (String(self.id) !== input.telegramUserId) {
      await markTelegramSessionState({
        userId: input.userId,
        state: TelegramSessionState.ERROR,
        error: "حساب اسکن‌شده با حساب بازکنندهٔ مینی‌اپ یکسان نیست.",
      });
      await notifySessionUser(input.telegramUserId, "اتصال رد شد: حساب QR با حساب بازکنندهٔ زربیت یکسان نیست.");
      await removeSessionFiles(storageKey);
      return;
    }
    if (!await verifyMembership(client)) {
      await markTelegramSessionState({
        userId: input.userId,
        state: TelegramSessionState.NOT_IN_GROUP,
        error: "این حساب عضو گروه معامله نیست.",
        membershipChecked: true,
      });
      await notifySessionUser(input.telegramUserId, "اتصال انجام نشد: این حساب عضو گروه معامله نیست.");
      await removeSessionFiles(storageKey);
      return;
    }
    await activateTelegramSession({
      userId: input.userId,
      storageKey,
      connectedTelegramUserId: input.telegramUserId,
      maxActiveSessions: env.MAX_TELEGRAM_SESSIONS,
    });
    await notifySessionUser(input.telegramUserId, "اتصال حساب تلگرام شما به زربیت فعال شد.");
  }).catch(async () => {
    if (challenges.get(input.userId) === challenge) {
      await markTelegramSessionState({
        userId: input.userId,
        state: TelegramSessionState.ERROR,
        error: "اتصال تلگرام ناموفق بود. دوباره تلاش کنید.",
      }).catch(() => undefined);
    }
  }).finally(async () => {
    challenges.delete(input.userId);
    await client.destroy().catch(() => undefined);
  });

  await qrReady(challenge);
  return challengeDto(challenge);
}

export async function revokeTelegramSession(userId: string): Promise<TelegramSessionDto> {
  const challenge = challenges.get(userId);
  if (challenge) await stopChallenge(challenge, true);
  const session = await getTelegramSessionForUser(userId);
  if (!session) return sessionDto(null);
  await markTelegramSessionState({ userId, state: TelegramSessionState.REVOKED });
  if (session.storageKey) await removeSessionFiles(session.storageKey);
  return getTelegramSessionStatus(userId);
}

export async function userCanManageRequests(userId: string): Promise<boolean> {
  const session = await getTelegramSessionForUser(userId);
  return session?.state === TelegramSessionState.ACTIVE && Boolean(session.membershipCheckedAt);
}
