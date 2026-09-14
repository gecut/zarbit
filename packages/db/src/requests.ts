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
        ACTIVE: "WAITING_QUOTE",
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
    triggeredQuote: row.triggeredQuote,
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
      connected(userId, (tx) =>
        tx.request.create({ data: { userId, ...input } }),
      ),
    editRequest: (userId: string, id: string, input: CreateRequestInput) =>
      connected(userId, async (tx) => {
        const result = await tx.request.updateMany({
          where: { id, userId, status: "ACTIVE", claimToken: null },
          data: input,
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
            executionPhase: { in: ["WAITING_QUOTE", "CLAIMED"] },
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
    requestCandidates: (quote: number) =>
      db.request.findMany({
        where: {
          status: "ACTIVE",
          claimToken: null,
          OR: [
            { condition: "GTE", targetPrice: { lte: quote } },
            { condition: "LTE", targetPrice: { gte: quote } },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    claimRequest: async (
      id: string,
      userId: string,
      token: string,
      quote?: { compactQuote: number; sourceMessageId: number },
    ) => {
      const result = await db.request.updateMany({
        where: {
          id,
          userId,
          status: "ACTIVE",
          claimToken: null,
          ...(quote
            ? {
                OR: [
                  {
                    condition: "GTE" as const,
                    targetPrice: { lte: quote.compactQuote },
                  },
                  {
                    condition: "LTE" as const,
                    targetPrice: { gte: quote.compactQuote },
                  },
                ],
              }
            : {}),
        },
        data: {
          claimToken: token,
          executionPhase: "CLAIMED",
          triggeredQuote: quote?.compactQuote,
          triggeredMessageId: quote?.sourceMessageId,
        },
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
    markSending: (id: string, claimToken: string, startedAt = now()) =>
      db.$transaction(async (tx) => {
        const row = await tx.request.findUnique({
          where: { id },
          select: { userId: true },
        });
        if (!row) return { count: 0 };
        await tx.$queryRaw`SELECT "id" FROM "TelegramSession" WHERE "userId" = ${row.userId} FOR UPDATE`;
        const session = await tx.telegramSession.findUnique({
          where: { userId: row.userId },
        });
        if (!session || session.state !== "ACTIVE" || !session.runtimeReady)
          return { count: 0 };
        return tx.request.updateMany({
          where: {
            id,
            claimToken,
            status: "ACTIVE",
            executionPhase: "CLAIMED",
            deliveryStartedAt: null,
          },
          data: { executionPhase: "SENDING", deliveryStartedAt: startedAt },
        });
      }),
    recoverRequests: () =>
      db.request.updateManyAndReturn({
        where: { status: "ACTIVE", claimToken: { not: null } },
        data: {
          status: "UNKNOWN",
          executionPhase: "UNKNOWN",
          resolutionState: "UNRESOLVED",
          completedAt: now(),
          failureReason: "سرویس هنگام اجرا متوقف شد؛ نتیجه ارسال مشخص نیست.",
        },
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
