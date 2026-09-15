import {
  AppError,
  telegramOperationSchema,
  type TelegramCommandInput,
  type TelegramIssue,
  type TelegramOperation,
} from "@zarbit/contracts";
import type {
  PrismaClient,
  TelegramOperation as OperationRow,
} from "../prisma/generated/client";

const pending = ["ACCEPTED", "RUNNING", "CANCEL_REQUESTED"] as const;
export function telegramOperationView(row: OperationRow): TelegramOperation {
  return telegramOperationSchema.parse({
    operationId: row.id,
    type: row.type,
    status: row.status,
    revision: row.revision,
    challengeId: row.challengeId,
    requestId: row.requestId,
    acceptedAt: row.acceptedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    issue: row.errorCode
      ? {
          code: row.errorCode,
          message: row.errorMessage,
          ...(row.errorField ? { field: row.errorField } : {}),
          ...(row.retryAt ? { retryAt: row.retryAt.toISOString() } : {}),
          requestId: row.requestId,
        }
      : null,
    cancelledRequests: row.cancelledRequests,
    sendingRequests: row.sendingRequests,
  });
}

export function createTelegramOperationStore(
  db: PrismaClient,
  now: () => Date,
) {
  return {
    telegramOperation: (userId: string, id: string) =>
      db.telegramOperation.findUnique({ where: { userId_id: { userId, id } } }),
    activeTelegramOperation: (userId: string) =>
      db.telegramOperation.findFirst({
        where: { userId, status: { in: [...pending] } },
        orderBy: { acceptedAt: "desc" },
      }),
    acceptTelegramOperation: (
      userId: string,
      input: TelegramCommandInput,
      requestId: string,
      deadline: number,
    ) =>
      db.$transaction(
        async (tx) => {
          // Serialize admission even when this owner has no session yet.
          await tx.$queryRaw`SELECT "id" FROM "TelegramUser" WHERE "id" = ${userId} FOR UPDATE`;
          const existing = await tx.telegramOperation.findUnique({
            where: { userId_id: { userId, id: input.operationId } },
          });
          if (existing) {
            if (
              existing.type !== input.command.type ||
              ("id" in input.command &&
                existing.challengeId !== input.command.id)
            )
              throw new AppError(
                "OPERATION_CONFLICT",
                "شناسه عملیات قبلاً برای اقدام دیگری استفاده شده است.",
                409,
              );
            return { operation: existing, created: false };
          }
          if (now().getTime() >= deadline)
            throw new AppError(
              "ADMISSION_EXPIRED",
              "مهلت ثبت عملیات تمام شد؛ وضعیت را بررسی کنید.",
              503,
            );
          await tx.$queryRaw`SELECT "id" FROM "TelegramSession" WHERE "userId" = ${userId} FOR UPDATE`;
          const session = await tx.telegramSession.findUnique({
            where: { userId },
          });
          const active = await tx.telegramOperation.findFirst({
            where: { userId, status: { in: [...pending] } },
            orderBy: { acceptedAt: "desc" },
          });
          const command = input.command;
          const stopping =
            command.type === "cancel" || command.type === "revoke";
          if (active && !stopping)
            throw new AppError(
              "OPERATION_PENDING",
              "عملیات قبلی هنوز در حال انجام است.",
              409,
            );
          if (session?.state === "REVOKING")
            throw new AppError(
              "SESSION_REVOKING",
              "قطع اتصال هنوز در حال انجام است.",
              409,
            );
          if (
            command.type === "cancel" &&
            ((session?.state !== "PENDING_OTP" && active?.type !== "login") ||
              (command.id !== session?.loginId &&
                command.id !== active?.challengeId))
          )
            throw new AppError(
              "LOGIN_EXPIRED",
              "این ورود دیگر معتبر نیست؛ وضعیت را تازه کنید.",
              404,
            );
          if (command.type === "revoke" && !session && !active)
            throw new AppError(
              "NO_SESSION",
              "اتصالی برای قطع کردن وجود ندارد.",
              409,
            );
          let cancelledRequests = 0;
          let sendingRequests = 0;
          if (stopping) {
            await tx.telegramOperation.updateMany({
              where: { userId, status: { in: [...pending] } },
              data: { status: "CANCEL_REQUESTED" },
            });
            await tx.telegramSession.upsert({
              where: { userId },
              create: {
                userId,
                state: "REVOKING",
                reasonCode:
                  command.type === "cancel"
                    ? "LOGIN_CANCELLED"
                    : "USER_DISCONNECTED",
              },
              update: {
                state: "REVOKING",
                runtimeReady: false,
                version: { increment: 1 },
                stateChangedAt: now(),
                reasonCode:
                  command.type === "cancel"
                    ? "LOGIN_CANCELLED"
                    : "USER_DISCONNECTED",
                lastError: null,
              },
            });
            if (command.type === "revoke") {
              const result = await tx.request.updateMany({
                where: {
                  userId,
                  status: "ACTIVE",
                  deliveryStartedAt: null,
                  executionPhase: { in: ["WAITING_TRADE", "CLAIMED"] },
                },
                data: {
                  status: "CANCELLED",
                  executionPhase: "CANCELLED",
                  completedAt: now(),
                  cancellationReason: "لغو هنگام قطع اتصال تلگرام",
                },
              });
              cancelledRequests = result.count;
              sendingRequests = await tx.request.count({
                where: { userId, status: "ACTIVE", executionPhase: "SENDING" },
              });
            }
          }
          const operation = await tx.telegramOperation.create({
            data: {
              userId,
              id: input.operationId,
              type: command.type,
              requestId,
              revision:
                command.type === "login"
                  ? (session?.revision ?? 0) + 1
                  : (session?.revision ?? 0),
              challengeId:
                command.type === "login"
                  ? input.operationId
                  : "id" in command
                    ? command.id
                    : null,
              acceptedAt: now(),
              cancelledRequests,
              sendingRequests,
            },
          });
          return { operation, created: true };
        },
        { maxWait: 1000, timeout: 4500 },
      ),
    claimTelegramOperation: (userId: string, id: string) =>
      db.telegramOperation.updateMany({
        where: { userId, id, status: "ACCEPTED" },
        data: { status: "RUNNING" },
      }),
    finishTelegramOperation: (
      userId: string,
      id: string,
      status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "INTERRUPTED",
      issue?: TelegramIssue,
    ) =>
      db.telegramOperation.updateMany({
        where: { userId, id, status: { in: [...pending] } },
        data: {
          status,
          completedAt: now(),
          errorCode: issue?.code ?? null,
          errorMessage: issue?.message ?? null,
          errorField: issue?.field ?? null,
          retryAt: issue?.retryAt ? new Date(issue.retryAt) : null,
        },
      }),
    finishTelegramCleanup: (userId: string) =>
      db.$transaction([
        db.telegramOperation.updateMany({
          where: {
            userId,
            type: { in: ["cancel", "revoke"] },
            status: { in: [...pending] },
          },
          data: { status: "SUCCEEDED", completedAt: now() },
        }),
        db.telegramOperation.updateMany({
          where: { userId, status: "CANCEL_REQUESTED" },
          data: { status: "CANCELLED", completedAt: now() },
        }),
      ]),
    recoverTelegramOperations: () =>
      db.telegramOperation.updateMany({
        where: {
          status: { in: [...pending] },
          type: { notIn: ["cancel", "revoke"] },
        },
        data: {
          status: "INTERRUPTED",
          completedAt: now(),
          errorCode: "WORKER_RESTARTED",
          errorMessage:
            "سرویس دوباره راه‌اندازی شد؛ وضعیت اتصال را بررسی کنید.",
        },
      }),
    pruneTelegramOperations: () =>
      db.telegramOperation.deleteMany({
        where: { completedAt: { lt: new Date(now().getTime() - 86_400_000) } },
      }),
  };
}
