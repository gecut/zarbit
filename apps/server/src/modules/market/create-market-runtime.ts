import type { Store } from "@zarbit/db";
import { MarketState } from "./market-state";
import { ReadCapacity } from "../../platform/resilience/read-capacity";
import { RpcMetrics } from "../../platform/observability/rpc-metrics";
import { serverLog } from "../../platform/observability/server-log";

export function createMarketRuntime(store: Store) {
  const capacity = new ReadCapacity();
  const metrics = new RpcMetrics((data) =>
    serverLog.info({ event: "market.metrics", ...data }, "market.metrics"),
  );
  const read = <T>(name: string, load: () => Promise<T>) =>
    capacity.run(() => metrics.measure(name, load));
  const state = new MarketState(
    () => read("heads", () => store.marketHeads()),
    (event) => metrics.cacheEvent("snapshot", event),
  );
  return {
    state,
    read,
    stop: async () => undefined,
  };
}
export type MarketRuntime = ReturnType<typeof createMarketRuntime>;
