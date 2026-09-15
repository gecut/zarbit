import type { Store } from "@zarbit/db";
import type { createRequestExecutor } from "./requests";
import { workerLog } from "./logger";

export interface TradeRequestProcessorOptions {
  intervalMs?: number;
}

export function createTradeRequestProcessor(
  store: Pick<Store, "claimTradeRequests" | "pendingTradeRequests">,
  executor: ReturnType<typeof createRequestExecutor>,
  groupId: number,
  options?: TradeRequestProcessorOptions,
) {
  let stopped = false;
  let scanning: Promise<void> | undefined;
  let rerunRequested = false;
  const executions = new Map<string, Promise<void>>();
  const wake = () => {
    if (stopped) return;
    if (scanning) {
      rerunRequested = true;
      return;
    }
    scanning = (async () => {
      const result = await store.claimTradeRequests(groupId);
      if (result) workerLog.info("request.trade_trigger.evaluated", result);
      for (const row of await store.pendingTradeRequests()) {
        if (stopped || executions.has(row.id)) continue;
        workerLog.info("request.trade_trigger.processing", {
          requestId: row.id,
          messageId: row.triggeredMessageId,
        });
        const task = executor
          .execute(row.userId, row.id, row)
          .catch((error: unknown) =>
            workerLog.failure("request.processing.failed", error, {
              requestId: row.id,
            }),
          )
          .finally(() => executions.delete(row.id));
        executions.set(row.id, task);
      }
    })()
      .catch((error: unknown) =>
        workerLog.failure("request.trade_scan.failed", error),
      )
      .finally(() => {
        scanning = undefined;
        if (!stopped && rerunRequested) {
          rerunRequested = false;
          wake();
        }
      });
  };
  const interval = options?.intervalMs ?? 30_000;
  const timer = setInterval(wake, interval);
  return {
    wake,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await scanning;
      await Promise.all(executions.values());
    },
  };
}
