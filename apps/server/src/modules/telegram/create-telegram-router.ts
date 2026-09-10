import type {
  RequestDetail,
  telegramSessionStatusSchema,
  WorkerCommand,
} from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";
import type { ResponseCache } from "../../platform/cache/response-cache";
import type { ReadCapacity } from "../../platform/resilience/read-capacity";

export type TelegramSessionStatusData = ReturnType<
  typeof telegramSessionStatusSchema.parse
>;

export interface TelegramRouterDependencies {
  store: AppDependencies["store"];
  command: AppDependencies["command"];
  sessions: ResponseCache<TelegramSessionStatusData>;
  active: ResponseCache<RequestDetail[]>;
  workerCapacity: ReadCapacity;
}

export function createTelegramRouter<TStatusProcedure, TCommandProcedure>(
  builder: {
    status: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
        }) => Promise<TelegramSessionStatusData>,
      ) => TStatusProcedure;
    };
    command: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: WorkerCommand;
        }) => Promise<TelegramSessionStatusData>,
      ) => TCommandProcedure;
    };
  },
  deps: TelegramRouterDependencies,
): { status: TStatusProcedure; command: TCommandProcedure } {
  const readStatus = async (id: string): Promise<TelegramSessionStatusData> =>
    (await deps.command(id, {
      type: "status",
    })) as unknown as TelegramSessionStatusData;

  return {
    status: builder.status.handler(({ context }) =>
      deps.sessions.get(context.user.id, () =>
        deps.workerCapacity.run(() => readStatus(context.user.id)),
      ),
    ),
    command: builder.command.handler(async ({ context, input }) => {
      const id = context.user.id;
      deps.sessions.invalidate(id);
      deps.active.invalidate(id);
      try {
        if (input.type === "revoke")
          await deps.store.disableSession(
            id,
            "REVOKING",
            "قطع اتصال درخواست شده؛ وضعیت درخواست‌های خود را بررسی کنید.",
          );
        return (await deps.command(
          id,
          input,
        )) as unknown as TelegramSessionStatusData;
      } finally {
        deps.sessions.invalidate(id);
        deps.active.invalidate(id);
      }
    }),
  };
}
