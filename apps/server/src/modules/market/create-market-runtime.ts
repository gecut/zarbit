import type { Store } from "@zarbit/db";
import { MarketHub } from "./market-hub";
import { MarketState } from "./market-state";
import { MarketListener } from "./market-listener";
import { ReadCapacity } from "../../platform/resilience/read-capacity";
import { RpcMetrics } from "../../platform/observability/rpc-metrics";
import { serverLog } from "../../platform/observability/server-log";

export function createMarketRuntime(store: Store, listenerUrl?: string) {
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
  const hub = new MarketHub((event, active) => {
    metrics.cacheEvent("hub", event);
    if (["opened", "closed", "slow_client"].includes(event))
      serverLog.debug(
        { event: "market.hub", action: event, active },
        "market.hub",
      );
  });
  const listener = listenerUrl
    ? new MarketListener({
        url: listenerUrl,
        state,
        hub,
        event: (event) => read("event", () => store.marketEvent(event)),
        observe: (event, details) => {
          metrics.cacheEvent("listener", event);
          if (["connected", "degraded", "invalid_notification"].includes(event))
            serverLog.info(
              { event: `market.listener.${event}`, ...details },
              `market.listener.${event}`,
            );
        },
      })
    : undefined;
  return {
    state,
    hub,
    read,
    start: async () => {
      await listener?.start();
    },
    stop: async () => {
      hub.stop();
      await listener?.stop();
    },
  };
}
export type MarketRuntime = ReturnType<typeof createMarketRuntime>;
