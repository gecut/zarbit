import type { Store } from "@zarbit/db";
import { store } from "@zarbit/db";
import { env } from "@zarbit/env/server";
import type {
  Identity,
  TelegramSessionStatus,
  WorkerCommand,
} from "@zarbit/contracts";
import { authenticateTelegramRequest } from "./security/telegram/authenticate-telegram-request";
import { createSessionCommand } from "./modules/telegram/create-session-command";
import { serverLog } from "./platform/observability/server-log";

export interface AppDependencies {
  store: Store;
  authenticate: (initData: string | undefined) => Identity;
  command: (
    id: string,
    command: WorkerCommand,
  ) => Promise<TelegramSessionStatus>;
}

export function createProductionDependencies(): AppDependencies {
  const transport = {
    fetch: globalThis.fetch,
    workerInternalToken: env.WORKER_INTERNAL_TOKEN,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
  };

  const command = createSessionCommand({
    ...transport,
    log: (event, details) => serverLog.error({ event, ...details }, event),
    observe: (event, details) =>
      serverLog[event === "worker.connection.recovered" ? "info" : "debug"](
        { event, ...details },
        event,
      ),
    store: { session: async (userId) => store.session(userId) },
  });

  return {
    store,
    authenticate: authenticateTelegramRequest,
    command,
  };
}
