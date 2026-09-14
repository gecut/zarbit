import type { Store } from "@zarbit/db";
import { store } from "@zarbit/db";
import { env } from "@zarbit/env/server";
import type {
  Identity,
  TelegramCommandInput,
  TelegramCommandReceipt,
  TelegramSessionStatus,
  WorkerCommand,
} from "@zarbit/contracts";
import { authenticateTelegramRequest } from "./security/telegram/authenticate-telegram-request";
import { sendWorkerOperation } from "./integrations/worker/send-worker-operation";
import { createSessionCommand } from "./modules/telegram/create-session-command";
import { serverLog } from "./platform/observability/server-log";

export interface AppDependencies {
  store: Store;
  acceptCommand: (
    id: string,
    input: TelegramCommandInput,
    requestId: string,
  ) => Promise<TelegramCommandReceipt>;
  authenticate: (initData: string | undefined) => Identity;
  command: (
    id: string,
    command: WorkerCommand,
    requestId?: string,
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
    store,
  });

  return {
    store,
    acceptCommand: (id, input, requestId) =>
      sendWorkerOperation(transport, id, input, requestId),
    authenticate: authenticateTelegramRequest,
    command,
  };
}
