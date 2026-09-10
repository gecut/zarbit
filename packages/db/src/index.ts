import { createMarketDataStore } from "./market-data";
import { createRequestStore } from "./requests";
import { PrismaPg } from "@prisma/adapter-pg";
import { databasePoolMax, databaseUrl } from "@zarbit/env/db";
import { Pool } from "pg";
import { AppError, type Identity } from "@zarbit/contracts";
import { PrismaClient, Prisma } from "../prisma/generated/client";

export * from "./market-data";

export const databasePoolOptions = {
  max: databasePoolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
} as const;

export function createPrismaClient(url = databaseUrl) {
  return new PrismaClient({
    adapter: new PrismaPg(
      new Pool({ connectionString: url, ...databasePoolOptions }),
    ),
  });
}
export function createStore(
  prisma: PrismaClient,
  now: () => Date = () => new Date(),
) {
  const session = (userId: string) =>
    prisma.telegramSession.findUnique({ where: { userId } });
  return {
    db: prisma,
    ...createRequestStore(prisma, now),
    ...createMarketDataStore(prisma, now),
    user: (identity: Identity) =>
      prisma.telegramUser.upsert({
        where: { telegramUserId: identity.telegramUserId },
        create: identity,
        update: { firstName: identity.firstName, username: identity.username },
      }),
    owner: (userId: string) =>
      prisma.telegramUser.findUnique({ where: { id: userId } }),
    session,
    consumeSend: (keys: string[], now: Date) =>
      prisma.$transaction(async (tx) => {
        for (const key of keys) {
          const current = await tx.loginRateLimit.findUnique({
            where: { key },
          });
          const fresh =
            !current ||
            now.getTime() - current.windowStartedAt.getTime() >= 900_000;
          const retryAt =
            current?.blockedUntil && current.blockedUntil > now
              ? current.blockedUntil
              : !fresh && current.count >= 3
                ? new Date(current.windowStartedAt.getTime() + 900_000)
                : null;
          if (retryAt)
            throw new AppError(
              "RATE_LIMITED",
              "تعداد درخواست کد بیش از حد مجاز است؛ کمی بعد تلاش کنید.",
              429,
              retryAt.toISOString(),
            );
          // Extend the window after each send; never exceed three in any rolling 15 minutes.
          await tx.loginRateLimit.upsert({
            where: { key },
            create: { key, windowStartedAt: now, count: 1 },
            update: fresh
              ? { windowStartedAt: now, count: 1, blockedUntil: null }
              : { windowStartedAt: now, count: { increment: 1 } },
          });
        }
      }),
    blockLogin: (keys: string[], until: Date) =>
      prisma.$transaction(
        keys.map((key) =>
          prisma.loginRateLimit.upsert({
            where: { key },
            create: { key, windowStartedAt: new Date(), blockedUntil: until },
            update: { blockedUntil: until },
          }),
        ),
      ),
    sessions: () =>
      prisma.telegramSession.findMany({ include: { user: true } }),
    beginSession: (userId: string, storageKey: string) =>
      prisma.telegramSession.upsert({
        where: { userId },
        create: { userId, storageKey },
        update: {
          storageKey,
          state: "PENDING_OTP",
          connectedTelegramUserId: null,
          revision: { increment: 1 },
          runtimeReady: false,
          connectionState: "OFFLINE",
          reasonCode: "LOGIN_REQUIRED",
          lastErrorCode: null,
          revokedAt: null,
          membershipCheckedAt: null,
          lastError: null,
          stateChangedAt: new Date(),
        },
      }),
    updateSession: (
      userId: string,
      revision: number,
      data: Prisma.TelegramSessionUpdateManyMutationInput,
    ) =>
      prisma.telegramSession.updateMany({
        where: { userId, revision },
        data: { ...data, lastObservedAt: new Date() },
      }),
    activateSession: (
      userId: string,
      revision: number,
      data: Prisma.TelegramSessionUpdateManyMutationInput,
    ) =>
      prisma.telegramSession.updateMany({
        where: {
          userId,
          revision,
          state: { in: ["ACTIVE", "PENDING_OTP", "NOT_IN_GROUP"] },
        },
        data: { ...data, lastObservedAt: new Date() },
      }),
    disableSession: (
      userId: string,
      state: "NOT_IN_GROUP" | "REVOKING" | "REVOKED" | "ERROR",
      error: string,
      revision?: number,
      reasonCode?: string,
    ) =>
      prisma.telegramSession
        .updateMany({
          where: {
            userId,
            ...(revision === undefined ? {} : { revision }),
            ...(state === "NOT_IN_GROUP"
              ? { state: { notIn: ["REVOKING", "REVOKED"] } }
              : {}),
          },
          data: {
            state,
            runtimeReady: false,
            connectionState: "OFFLINE",
            lastError: error,
            reasonCode: reasonCode ?? null,
            lastErrorCode: reasonCode ?? null,
            ...(state === "REVOKED" ? { revokedAt: new Date() } : {}),
            stateChangedAt: new Date(),
          },
        })
        .then((changed) => changed.count === 1),
    recover: async () => {
      await prisma.telegramSession.updateMany({
        data: {
          runtimeReady: false,
          runtimeCheckedAt: null,
          connectionState: "OFFLINE",
        },
      });
      await prisma.telegramSession.updateMany({
        where: { state: "ACTIVE" },
        data: {
          connectionState: "DEGRADED",
          reasonCode: "NETWORK_UNAVAILABLE",
        },
      });
      await prisma.telegramSession.updateMany({
        where: { state: "PENDING_OTP", connectedTelegramUserId: { not: null } },
        data: {
          state: "ACTIVE",
          connectionState: "DEGRADED",
          reasonCode: "NETWORK_UNAVAILABLE",
          lastError: null,
        },
      });
      await prisma.telegramSession.updateMany({
        where: { state: "PENDING_OTP", connectedTelegramUserId: null },
        data: {
          state: "ERROR",
          lastError: "ورود نیمه‌تمام منقضی شد؛ دوباره وارد شوید.",
        },
      });
    },
    latestQuote: async (): Promise<QuoteRecord | null> =>
      prisma.quoteHistory.findFirst({
        orderBy: [{ announcedAt: "desc" }, { sourceMessageId: "desc" }],
      }),
    quotesSince: async (announcedAt: Date): Promise<QuoteRecord[]> =>
      prisma.quoteHistory.findMany({
        where: { announcedAt: { gte: announcedAt } },
        orderBy: [{ announcedAt: "asc" }, { sourceMessageId: "asc" }],
      }),
    recordQuote: async (input: {
      compactQuote: number;
      announcedAt: Date;
      receivedAt: Date;
      sourceMessageId: number;
      chatId?: bigint | number;
    }) =>
      prisma.$transaction(async (tx) => {
        const cutoff = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1_000);
        await tx.quoteHistory.deleteMany({
          where: { announcedAt: { lt: cutoff } },
        });
        const currentLatest = await tx.quoteHistory.findFirst({
          orderBy: [{ announcedAt: "desc" }, { sourceMessageId: "desc" }],
        });
        const shouldRetainHistory = input.announcedAt >= cutoff;
        let historyRecorded = false;
        if (shouldRetainHistory) {
          const history = await tx.quoteHistory.createMany({
            data: {
              compactQuote: input.compactQuote,
              announcedAt: input.announcedAt,
              receivedAt: input.receivedAt,
              sourceMessageId: input.sourceMessageId,
              ...(input.chatId !== undefined
                ? { chatId: BigInt(input.chatId) }
                : {}),
            },
            skipDuplicates: true,
          });
          historyRecorded = history.count === 1;
        }
        const isNewer =
          !currentLatest ||
          input.announcedAt > currentLatest.announcedAt ||
          (input.announcedAt.getTime() ===
            currentLatest.announcedAt.getTime() &&
            input.sourceMessageId > currentLatest.sourceMessageId);
        const latestUpdated = historyRecorded && isNewer;

        return { historyRecorded, latestUpdated };
      }),
  };
}
export interface QuoteRecord {
  id: number;
  compactQuote: number;
  announcedAt: Date;
  receivedAt: Date;
  sourceMessageId: number;
  chatId?: bigint | null;
  createdAt: Date;
}
export type Store = ReturnType<typeof createStore>;
export type SessionRecord = NonNullable<Awaited<ReturnType<Store["session"]>>>;
const databasePool = new Pool({
  connectionString: databaseUrl,
  ...databasePoolOptions,
});
export const prisma = new PrismaClient({
  adapter: new PrismaPg(databasePool),
});

export function databasePoolStats() {
  return {
    databasePoolTotal: databasePool.totalCount,
    databasePoolIdle: databasePool.idleCount,
    databasePoolWaiting: databasePool.waitingCount,
  };
}

export async function checkDatabaseHealth() {
  const startedAt = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return {
    databaseLatencyMs: Date.now() - startedAt,
    ...databasePoolStats(),
  };
}

export const store = createStore(prisma);
export default prisma;
