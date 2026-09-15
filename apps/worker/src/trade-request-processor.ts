import type { Store } from "@zarbit/db";
import type { createRequestExecutor } from "./requests";
import { workerLog } from "./logger";

export function createTradeRequestProcessor(
  store: Pick<Store, "claimTradeRequests" | "pendingTradeRequests">,
  executor: ReturnType<typeof createRequestExecutor>,
  groupId: number,
) {
  let stopped = false;
  let scanning: Promise<void> | undefined;
  const executions = new Map<string, Promise<void>>();
  const wake = () => {
    if (stopped || scanning) return;
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
      });
  };
  const timer = setInterval(wake, 1000);
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
