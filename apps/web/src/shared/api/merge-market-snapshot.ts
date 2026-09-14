import type { MarketSnapshot, MarketLiveEvent } from "@zarbit/contracts";
export function mergeMarketSnapshot(
  _previous: MarketSnapshot | undefined,
  incoming: MarketSnapshot,
): MarketSnapshot {
  return incoming;
}
export function applyMarketEvent(
  snapshot: MarketSnapshot,
  _event: MarketLiveEvent,
): MarketSnapshot {
  return snapshot;
}
