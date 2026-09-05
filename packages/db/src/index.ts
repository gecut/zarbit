import { randomUUID } from "node:crypto";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { databaseUrl } from "@zarbit/env/db";
import { humanPriceToCompactQuote } from "@zarbit/domain";
import {
  AppError,
  type Identity,
  type RequestPayload,
  type RequestStatus as PublicRequestStatus,
} from "@zarbit/contracts";
import {
  PrismaClient,
  Prisma,
  RequestStatus,
  TelegramSessionState,
} from "../prisma/generated/client";

export function createPrismaClient(url = databaseUrl) {
  return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}
export const READY_TTL_MS = 30_000;
export const MEMBERSHIP_TTL_MS = 60_000;
export function readyWhere(now = new Date()): Prisma.TelegramSessionWhereInput {
  return {
    state: "ACTIVE",
    runtimeReady: true,
    runtimeCheckedAt: { gte: new Date(now.getTime() - READY_TTL_MS) },
    membershipCheckedAt: { gte: new Date(now.getTime() - MEMBERSHIP_TTL_MS) },
  };
}
export const uncertainMessage =
  "نتیجه ارسال قبلی مشخص نیست؛ پیش از ثبت مجدد درخواست، پیام‌های گروه را بررسی کنید.";
const compactInput = (input: RequestPayload) => ({
  ...input,
  targetPrice: humanPriceToCompactQuote(input.targetPrice),
});

export function createStore(prisma: PrismaClient) {
  const session = (userId: string) =>
    prisma.telegramSession.findUnique({ where: { userId } });
  const requireReady = async (tx: Prisma.TransactionClient, userId: string) => {
    if (
      !(await tx.telegramSession.findFirst({
        where: { userId, ...readyWhere() },
      }))
    )
      throw new AppError(
        "SESSION_NOT_READY",
        "اتصال تلگرام و عضویت گروه باید آماده باشد.",
      );
  };
  return {
    db: prisma,
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
      prisma.telegramSession.updateMany({ where: { userId, revision }, data }),
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
        data,
      }),
    disableSession: (
      userId: string,
      state: "NOT_IN_GROUP" | "REVOKING" | "REVOKED" | "ERROR",
      error: string,
      revision?: number,
    ) =>
      prisma.$transaction(async (tx) => {
        const changed = await tx.telegramSession.updateMany({
          where: {
            userId,
            ...(revision === undefined ? {} : { revision }),
            ...(state === "NOT_IN_GROUP"
              ? {
                  state: {
                    notIn: ["REVOKING", "REVOKED"] as TelegramSessionState[],
                  },
                }
              : {}),
          },
          data: {
            state,
            runtimeReady: false,
            lastError: error,
            stateChangedAt: new Date(),
          },
        });
        if (changed.count)
          await tx.request.updateMany({
            where: { userId, status: "ACTIVE", claimToken: null },
            data: {
              status: "CANCELLED",
              cancellationReason: error,
              completedAt: new Date(),
            },
          });
        return changed.count === 1;
      }),
    recover: async () => {
      await prisma.telegramSession.updateMany({
        data: { runtimeReady: false, runtimeCheckedAt: null },
      });
      await prisma.telegramSession.updateMany({
        where: { state: "PENDING_OTP", connectedTelegramUserId: { not: null } },
        data: { state: "ACTIVE", lastError: null },
      });
      await prisma.telegramSession.updateMany({
        where: { state: "PENDING_OTP", connectedTelegramUserId: null },
        data: {
          state: "ERROR",
          lastError: "ورود نیمه‌تمام منقضی شد؛ دوباره وارد شوید.",
        },
      });
      await prisma.request.updateMany({
        where: { status: "ACTIVE", claimToken: { not: null } },
        data: {
          status: "FAILED",
          failureReason: uncertainMessage,
          completedAt: new Date(),
        },
      });
    },
    request: (userId: string, id: string) =>
      prisma.request.findFirst({ where: { id, userId } }),
    list: async (
      userId: string,
      status: PublicRequestStatus | "HISTORY" | undefined,
      page = 1,
    ) => {
      const where: Prisma.RequestWhereInput = {
        userId,
        ...(status === "HISTORY"
          ? { status: { not: "ACTIVE" } }
          : status
            ? { status }
            : {}),
      };
      const [items, total, activeCount] = await prisma.$transaction([
        prisma.request.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * 20,
          take: 20,
        }),
        prisma.request.count({ where }),
        prisma.request.count({ where: { userId, status: "ACTIVE" } }),
      ]);
      return { items, total, activeCount, page, pageSize: 20 };
    },
    create: (userId: string, input: RequestPayload) =>
      prisma.$transaction(async (tx) => {
        await requireReady(tx, userId);
        return tx.request.create({ data: { userId, ...compactInput(input) } });
      }),
    edit: (userId: string, id: string, input: RequestPayload) =>
      prisma.$transaction(async (tx) => {
        await requireReady(tx, userId);
        const update = await tx.request.updateMany({
          where: { id, userId, status: "ACTIVE", claimToken: null },
          data: compactInput(input),
        });
        return update.count ? tx.request.findUnique({ where: { id } }) : null;
      }),
    cancel: async (userId: string, id: string) => {
      const result = await prisma.request.updateMany({
        where: { id, userId, status: "ACTIVE", claimToken: null },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      return result.count === 1;
    },
    candidates: (userId: string, quote: number, quoteAt: Date) =>
      prisma.request.findMany({
        where: {
          userId,
          createdAt: { lte: quoteAt },
          status: "ACTIVE",
          claimToken: null,
          OR: [
            { condition: "LTE", targetPrice: { gte: quote } },
            { condition: "GTE", targetPrice: { lte: quote } },
          ],
        },
        select: { id: true },
      }),
    claim: async (
      userId: string,
      id: string,
      quote: number,
      quoteAt: Date,
      revision: number,
    ) => {
      const token = randomUUID();
      const changed = await prisma.request.updateMany({
        where: {
          id,
          userId,
          createdAt: { lte: quoteAt },
          status: "ACTIVE",
          claimToken: null,
          user: { telegramSession: { is: { ...readyWhere(), revision } } },
          OR: [
            { condition: "LTE", targetPrice: { gte: quote } },
            { condition: "GTE", targetPrice: { lte: quote } },
          ],
        },
        data: { claimToken: token, claimedAt: new Date() },
      });
      return changed.count
        ? prisma.request.findUnique({
            where: { claimToken: token },
            include: { user: true },
          })
        : null;
    },
    finish: async (
      id: string,
      token: string,
      quote: number,
      messageId: number,
      result: { outgoingMessageId?: number; error?: string },
    ) => {
      const changed = await prisma.request.updateMany({
        where: { id, claimToken: token, status: "ACTIVE" },
        data: {
          status: result.error ? "FAILED" : "DONE",
          failureReason: result.error ?? null,
          triggeredQuote: quote,
          triggeredMessageId: messageId,
          outgoingMessageId: result.outgoingMessageId ?? null,
          completedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new AppError("CLAIM_LOST", uncertainMessage);
    },
  };
}
export type Store = ReturnType<typeof createStore>;
export type SessionRecord = NonNullable<Awaited<ReturnType<Store["session"]>>>;
export { RequestStatus, TelegramSessionState };
export const prisma = createPrismaClient();
export const store = createStore(prisma);
export default prisma;
