import { randomUUID } from "node:crypto";
import { isFreshTrade } from "@zarbit/domain";
import {
  eligibleTrade,
  emptyTrigger,
  latestGroupTrade,
  lockTradeStream,
  tradeTrigger,
} from "./trade-trigger";
import {
  AppError,
  type CreateRequestInput,
  type RequestDetail,
} from "@zarbit/contracts";
import type { PrismaClient, Prisma } from "../prisma/generated/client";
import type { Request as RequestRecord } from "../prisma/generated/client";

type RequestViewRow = Omit<
  RequestRecord,
  | "executionPhase"
  | "outcomeCode"
  | "deliveryStartedAt"
  | "unknownReason"
  | "resolutionState"
> &
  Partial<
    Pick<
      RequestRecord,
      | "executionPhase"
      | "outcomeCode"
      | "deliveryStartedAt"
      | "unknownReason"
      | "resolutionState"
    >
  >;
export function requestView(row: RequestViewRow): RequestDetail {
  const executionPhase =
    row.executionPhase ??
    (
      {
        ACTIVE: "WAITING_TRADE",
        DONE: "DONE",
        FAILED: "FAILED",
        CANCELLED: "CANCELLED",
        UNKNOWN: "UNKNOWN",
      } as const
    )[row.status];
  return {
    id: row.id,
    condition: row.condition,
    action: row.action,
    targetPrice: row.targetPrice,
    units: row.units,
    status: row.status,
    executing: executionPhase === "CLAIMED" || executionPhase === "SENDING",
    executionPhase,
    outcomeCode: row.outcomeCode ?? null,
    deliveryStartedAt: row.deliveryStartedAt?.toISOString() ?? null,
    unknownReason: row.unknownReason ?? null,
    resolutionState:
      row.resolutionState ??
      (row.status === "UNKNOWN" ? "UNRESOLVED" : "NOT_APPLICABLE"),
    triggeredPrice: row.triggeredPrice,
    triggerSource: row.triggerSource,
    triggeredTradeId: row.triggeredTradeId,
    triggeredAt: row.triggeredAt?.toISOString() ?? null,
    triggeredMessageId: row.triggeredMessageId,
    outgoingMessageId: row.outgoingMessageId,
    completedAt: row.completedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
const conflict = () =>
  new AppError(
    "REQUEST_CONFLICT",
    "درخواست تغییر کرده یا در حال اجراست؛ وضعیت را تازه کنید.",
  );
const cursorShape = (
  value: unknown,
): value is { createdAt: string; id: string } => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.createdAt === "string" &&
    Number.isFinite(Date.parse(v.createdAt)) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    v.id.length <= 100
  );
};
export function createRequestStore(db: PrismaClient, now: () => Date) {
  const connected = <T>(
    userId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TelegramSession" WHERE "userId" = ${userId} FOR UPDATE`;
      const session = await tx.telegramSession.findUnique({
        where: { userId },
      });
      if (!session || session.state !== "ACTIVE" || !session.runtimeReady)
        throw new AppError(
          "SESSION_REQUIRED",
          "ابتدا اتصال تلگرام را برقرار کنید.",
        );
      return work(tx);
    });
  const arm = async (tx: Prisma.TransactionClient) => {
    const head = await tx.trade.findFirst({
      where: { type: "NORMAL" },
      orderBy: { sourceMessageId: "desc" },
      select: { sourceMessageId: true },
    });
    return { armedAt: now(), armedAfterMessageId: head?.sourceMessageId ?? 0 };
  };
  return {
    request: (userId: string, id: string) =>
      db.request.findFirst({ where: { userId, id } }),
    activeRequests: (userId: string) =>
      db.request.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    requestHistory: async (userId: string, cursor?: string) => {
      let after: { createdAt: string; id: string } | undefined;
      if (cursor) {
        try {
          if (cursor.length > 1024) throw new Error();
          const value: unknown = JSON.parse(
            Buffer.from(cursor, "base64url").toString(),
          );
          if (!cursorShape(value)) throw new Error();
          after = value;
        } catch {
          throw new AppError("INVALID_CURSOR", "نشانی صفحه نامعتبر است.", 400);
        }
      }
      const rows = await db.request.findMany({
        where: {
          userId,
          status: { not: "ACTIVE" },
          ...(after
            ? {
                OR: [
                  { createdAt: { lt: new Date(after.createdAt) } },
                  {
                    createdAt: new Date(after.createdAt),
                    id: { lt: after.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 31,
      });
      const items = rows.slice(0, 30);
      const last = items.at(-1);
      return {
        items: items.map(requestView),
        nextCursor:
          rows.length > 30 && last
            ? Buffer.from(
                JSON.stringify({
                  createdAt: last.createdAt.toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      };
    },
    createRequest: (userId: string, input: CreateRequestInput) =>
      connected(userId, async (tx) =>
        tx.request.create({ data: { userId, ...input, ...(await arm(tx)) } }),
      ),
    editRequest: (userId: string, id: string, input: CreateRequestInput) =>
      connected(userId, async (tx) => {
        const result = await tx.request.updateMany({
          where: { id, userId, status: "ACTIVE", claimToken: null },
          data: { ...input, ...(await arm(tx)), ...emptyTrigger },
        });
        if (!result.count) throw conflict();
        return tx.request.findUniqueOrThrow({ where: { id } });
      }),
    cancelRequest: (userId: string, id: string) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "TelegramSession" WHERE "userId" = ${userId} FOR UPDATE`;
        const result = await tx.request.updateMany({
          where: {
            id,
            userId,
            status: "ACTIVE",
            deliveryStartedAt: null,
            executionPhase: { in: ["WAITING_TRADE", "CLAIMED"] },
          },
          data: {
            status: "CANCELLED",
            executionPhase: "CANCELLED",
            completedAt: now(),
            cancellationReason: "لغو توسط کاربر",
          },
        });
        if (!result.count) throw conflict();
        return tx.request.findUniqueOrThrow({ where: { id } });
      }),
    initializeTradeRequests: (groupId: number | bigint) =>
      db.$transaction(async (tx) => {
        const chatId = BigInt(groupId);
        await lockTradeStream(tx, chatId);
        const latest = await latestGroupTrade(tx, chatId);
        await tx.tradeRequestCursor.upsert({
          where: { chatId },
          create: { chatId, sourceMessageId: latest?.sourceMessageId ?? 0 },
          update: {},
        });
      }),
    claimTradeRequests: (groupId: number | bigint) =>
      db.$transaction(async (tx) => {
        const chatId = BigInt(groupId);
        await lockTradeStream(tx, chatId);
        const ingestion = await tx.groupIngestionState.findUnique({
          where: { chatId },
        });
        if (ingestion?.gateStatus === "REVIEW_REQUIRED") return;
        const cursor = await tx.tradeRequestCursor.findUniqueOrThrow({
          where: { chatId },
        });
        const trade = await latestGroupTrade(tx, chatId);
        if (
          !trade ||
          trade.sourceMessageId === null ||
          trade.sourceMessageId <= cursor.sourceMessageId
        )
          return;
        const fresh = isFreshTrade(trade.announcedAt, now());
        let claimed = 0;
        if (fresh) {
          const candidates = await tx.request.findMany({
            where: {
              status: "ACTIVE",
              executionPhase: "WAITING_TRADE",
              claimToken: null,
              armedAt: { lt: trade.announcedAt },
              armedAfterMessageId: { lt: trade.sourceMessageId },
              OR: [
                { condition: "GTE", targetPrice: { lte: trade.compactPrice } },
                { condition: "LTE", targetPrice: { gte: trade.compactPrice } },
              ],
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
          for (const row of candidates) {
            const result = await tx.request.updateMany({
              where: {
                id: row.id,
                status: "ACTIVE",
                executionPhase: "WAITING_TRADE",
                claimToken: null,
                condition: row.condition,
                targetPrice: row.targetPrice,
                action: row.action,
                units: row.units,
                updatedAt: row.updatedAt,
                armedAt: row.armedAt,
                armedAfterMessageId: row.armedAfterMessageId,
              },
              data: {
                claimToken: randomUUID(),
                executionPhase: "CLAIMED",
                ...tradeTrigger(trade),
              },
            });
            claimed += result.count;
          }
        }
        await tx.tradeRequestCursor.update({
          where: { chatId },
          data: { sourceMessageId: trade.sourceMessageId },
        });
        return {
          messageId: trade.sourceMessageId,
          claimed,
          reason: fresh ? "EVALUATED" : "STALE_OR_FUTURE",
        };
      }),
    pendingTradeRequests: () =>
      db.request.findMany({
        where: {
          status: "ACTIVE",
          executionPhase: "CLAIMED",
          deliveryStartedAt: null,
          triggerSource: "TRADE",
          claimToken: { not: null },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    claimRequest: async (id: string, userId: string, token: string) => {
      const result = await db.request.updateMany({
        where: {
          id,
          userId,
          status: "ACTIVE",
          executionPhase: "WAITING_TRADE",
          claimToken: null,
        },
        data: { claimToken: token, executionPhase: "CLAIMED", ...emptyTrigger },
      });
      return result.count
        ? db.request.findUniqueOrThrow({ where: { id } })
        : null;
    },
    completeRequest: (
      id: string,
      claimToken: string,
      result: {
        status: "DONE" | "FAILED" | "UNKNOWN";
        outgoingMessageId?: number;
        failureReason?: string;
      },
    ) =>
      db.request.updateMany({
        where: { id, claimToken, status: "ACTIVE" },
        data: {
          ...result,
          executionPhase: result.status,
          resolutionState:
            result.status === "UNKNOWN" ? "UNRESOLVED" : "NOT_APPLICABLE",
          unknownReason:
            result.status === "UNKNOWN" ? result.failureReason : null,
          completedAt: now(),
        },
      }),
    markSending: (id: string, claimToken: string) =>
      db.$transaction(async (tx) => {
        const initial = await tx.request.findUnique({ where: { id } });
        if (!initial) return { count: 0, row: null };
        if (initial.triggeredChatId !== null)
          await lockTradeStream(tx, initial.triggeredChatId);
        if (initial.triggeredChatId !== null) {
          const ingestion = await tx.groupIngestionState.findUnique({
            where: { chatId: initial.triggeredChatId },
          });
          if (ingestion?.gateStatus === "REVIEW_REQUIRED") {
            await tx.request.updateMany({
              where: {
                id,
                claimToken,
                status: "ACTIVE",
                executionPhase: "CLAIMED",
                deliveryStartedAt: null,
              },
              data: {
                executionPhase: "WAITING_TRADE",
                claimToken: null,
                ...emptyTrigger,
              },
            });
            return {
              count: 0,
              row: null,
              reason: "FINANCIAL_REVIEW_REQUIRED" as const,
            };
          }
        }
        await tx.$queryRaw`SELECT "id" FROM "TelegramSession" WHERE "userId" = ${initial.userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Request" WHERE "id" = ${id} FOR UPDATE`;
        const row = await tx.request.findUniqueOrThrow({ where: { id } });
        if (
          row.claimToken !== claimToken ||
          row.status !== "ACTIVE" ||
          row.executionPhase !== "CLAIMED" ||
          row.deliveryStartedAt !== null
        )
          return { count: 0, row: null };
        const session = await tx.telegramSession.findUnique({
          where: { userId: row.userId },
        });
        if (!session || session.state !== "ACTIVE" || !session.runtimeReady)
          throw new AppError("SESSION_REQUIRED", "اتصال تلگرام فعال نیست.");
        let startedAt = now();
        let trigger: Partial<ReturnType<typeof tradeTrigger>> = {};
        if (row.triggerSource === "TRADE") {
          const trade =
            row.triggeredChatId === null
              ? null
              : await latestGroupTrade(tx, row.triggeredChatId);
          startedAt = now();
          if (!eligibleTrade(row, trade, startedAt)) {
            await tx.request.update({
              where: { id },
              data: {
                executionPhase: "WAITING_TRADE",
                claimToken: null,
                ...emptyTrigger,
              },
            });
            return { count: 0, row: null, reason: "TRADE_INVALID" as const };
          }
          trigger = tradeTrigger(trade);
        }
        const started = await tx.request.update({
          where: { id },
          data: {
            ...trigger,
            executionPhase: "SENDING",
            deliveryStartedAt: startedAt,
          },
        });
        return { count: 1, row: started };
      }),
    recoverRequests: () =>
      db.$transaction(async (tx) => {
        // Claims without a send can be safely resumed. Legacy/manual claims are rearmed.
        await tx.request.updateMany({
          where: {
            status: "ACTIVE",
            executionPhase: "CLAIMED",
            deliveryStartedAt: null,
            OR: [{ triggerSource: null }, { triggerSource: "QUOTE" }],
          },
          data: {
            executionPhase: "WAITING_TRADE",
            claimToken: null,
            ...emptyTrigger,
          },
        });
        return tx.request.updateManyAndReturn({
          where: {
            status: "ACTIVE",
            OR: [
              { executionPhase: "SENDING" },
              { deliveryStartedAt: { not: null } },
            ],
          },
          data: {
            status: "UNKNOWN",
            executionPhase: "UNKNOWN",
            resolutionState: "UNRESOLVED",
            completedAt: now(),
            unknownReason: "سرویس هنگام ارسال متوقف شد؛ نتیجه ارسال مشخص نیست.",
            failureReason: "سرویس هنگام ارسال متوقف شد؛ نتیجه ارسال مشخص نیست.",
          },
        });
      }),
    pruneRequests: () =>
      db.request.deleteMany({
        where: {
          status: { not: "ACTIVE" },
          completedAt: { lt: new Date(now().getTime() - 30 * 86400_000) },
        },
      }),
  };
}
