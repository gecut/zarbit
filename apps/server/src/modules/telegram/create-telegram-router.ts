import { serverLog } from "../../platform/observability/server-log";
import {
  AppError,
  type TelegramCommandInput,
  type TelegramCommandReceipt,
  type TelegramOperation,
  type TelegramSessionStatus,
} from "@zarbit/contracts";
import { telegramOperationView } from "@zarbit/db/telegram-operations";
import type { AppDependencies } from "../../app-dependencies";
import type { ResponseCache } from "../../platform/cache/response-cache";
import type { ReadCapacity } from "../../platform/resilience/read-capacity";
import type { RequestDetail } from "@zarbit/contracts";

type Context = { user: { id: string }; requestId: string };
export interface TelegramRouterDependencies {
  store: AppDependencies["store"];
  command: AppDependencies["command"];
  acceptCommand: AppDependencies["acceptCommand"];
  sessions: ResponseCache<TelegramSessionStatus>;
  active: ResponseCache<RequestDetail[]>;
  workerCapacity: ReadCapacity;
}
export function createTelegramRouter<TStatus, TCommand, TOperation>(
  builder: {
    status: {
      handler: (
        fn: (opt: { context: Context }) => Promise<TelegramSessionStatus>,
      ) => TStatus;
    };
    command: {
      handler: (
        fn: (opt: {
          context: Context;
          input: TelegramCommandInput;
        }) => Promise<TelegramCommandReceipt>,
      ) => TCommand;
    };
    operation: {
      handler: (
        fn: (opt: {
          context: Context;
          input: { id: string };
        }) => Promise<TelegramOperation | null>,
      ) => TOperation;
    };
  },
  deps: TelegramRouterDependencies,
) {
  return {
    status: builder.status.handler(({ context }) =>
      deps.sessions.get(context.user.id, () =>
        deps.workerCapacity.run(() =>
          deps.command(context.user.id, { type: "status" }, context.requestId),
        ),
      ),
    ),
    operation: builder.operation.handler(async ({ context, input }) => {
      const row = await deps.store.telegramOperation(context.user.id, input.id);
      return row ? telegramOperationView(row) : null;
    }),
    command: builder.command.handler(async ({ context, input }) => {
      const id = context.user.id;
      deps.sessions.invalidate(id);
      deps.active.invalidate(id);
      try {
        const existing = await deps.store.telegramOperation(
          id,
          input.operationId,
        );
        if (existing)
          return {
            operationId: existing.id,
            acceptedAt: existing.acceptedAt.toISOString(),
          };
        if (
          input.command.type === "revoke" ||
          input.command.type === "cancel"
        ) {
          const { operation } = await deps.store.acceptTelegramOperation(
            id,
            input,
            context.requestId,
            Date.now() + 5000,
          );
          // Persisted cleanup is accepted even when the worker is unreachable.
          void deps.acceptCommand(id, input, context.requestId).catch(() => {
            serverLog.warn(
              {
                event: "telegram.cleanup.worker_unavailable",
                requestId: context.requestId,
                operationId: input.operationId,
              },
              "telegram.cleanup.worker_unavailable",
            );
          });
          return {
            operationId: operation.id,
            acceptedAt: operation.acceptedAt.toISOString(),
          };
        }
        try {
          return await deps.acceptCommand(id, input, context.requestId);
        } catch (error) {
          const accepted = await deps.store.telegramOperation(
            id,
            input.operationId,
          );
          if (accepted)
            return {
              operationId: accepted.id,
              acceptedAt: accepted.acceptedAt.toISOString(),
            };
          if (error instanceof AppError) throw error;
          throw new AppError(
            "WORKER_UNAVAILABLE",
            "ثبت عملیات تأیید نشد؛ نتیجه را بررسی کنید.",
            503,
          );
        }
      } finally {
        deps.sessions.invalidate(id);
        deps.active.invalidate(id);
      }
    }),
  };
}
