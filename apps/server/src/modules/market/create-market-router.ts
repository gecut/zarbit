import type { MarketSnapshot } from "@zarbit/contracts";
import type { MarketState } from "./market-state";

export function createMarketRouter<TSnapshot>(
  builder: {
    snapshot: { handler: (fn: () => Promise<MarketSnapshot>) => TSnapshot };
  },
  deps: {
    state: MarketState;
  },
) {
  return {
    snapshot: builder.snapshot.handler(() => deps.state.read()),
  };
}
