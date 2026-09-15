import {
  marketSnapshotSchema,
  type MarketSnapshot,
  type MarketLiveEvent,
} from "@zarbit/contracts";

export function mergeMarketSnapshot(
  previous: MarketSnapshot | undefined,
  incoming: MarketSnapshot,
): MarketSnapshot {
  const quote =
    previous?.quote &&
    previous.quote.sourceMessageId > (incoming.quote?.sourceMessageId ?? 0)
      ? previous.quote
      : incoming.quote;
  const trade =
    previous?.trade &&
    previous.trade.sourceMessageId > (incoming.trade?.sourceMessageId ?? 0)
      ? previous.trade
      : incoming.trade;
  const trades = new Map(
    [...(previous?.recentTrades ?? []), ...incoming.recentTrades].map(
      (item) => [item.sourceMessageId, item],
    ),
  );
  if (trade) trades.set(trade.sourceMessageId, trade);
  return {
    ...incoming,
    quote,
    trade,
    revision: Math.max(
      previous?.revision ?? 0,
      incoming.revision,
      quote?.sourceMessageId ?? 0,
      trade?.sourceMessageId ?? 0,
    ),
    recentTrades: [...trades.values()]
      .sort((a, b) => b.sourceMessageId - a.sourceMessageId)
      .slice(0, 10),
    tradeQuoteDifference:
      trade && quote ? trade.compactPrice - quote.compactPrice : null,
    asOf:
      previous && previous.asOf > incoming.asOf ? previous.asOf : incoming.asOf,
  };
}

// TanStack exposes structural-sharing inputs as unknown.
export function mergeMarketQueryData(
  previous: unknown,
  incoming: unknown,
): MarketSnapshot {
  return mergeMarketSnapshot(
    marketSnapshotSchema.safeParse(previous).data,
    marketSnapshotSchema.parse(incoming),
  );
}

export function applyMarketEvent(
  snapshot: MarketSnapshot,
  event: MarketLiveEvent,
): MarketSnapshot {
  if (event.type !== "QUOTE" && event.type !== "TRADE") return snapshot;
  if (event.type === "QUOTE") {
    const { compactPrice, announcedAt, sourceMessageId } = event;
    return mergeMarketSnapshot(snapshot, {
      ...snapshot,
      quote: { compactPrice, announcedAt, sourceMessageId },
      revision: event.revision,
    });
  }
  const { id, compactPrice, announcedAt, sourceMessageId, quantity } = event;
  const trade = { id, compactPrice, announcedAt, sourceMessageId, quantity };
  return mergeMarketSnapshot(snapshot, {
    ...snapshot,
    trade,
    recentTrades: [trade],
    revision: event.revision,
  });
}
