import type { MarketSnapshot, MarketLiveEvent } from "@zarbit/contracts";
import { compareTradeToQuote } from "@zarbit/domain";

/** Each stream advances independently; a Trade must never overwrite the Quote. */
export function mergeMarketSnapshot(
  previous: MarketSnapshot | undefined,
  incoming: MarketSnapshot,
): MarketSnapshot {
  if (!previous) return incoming;
  const quote =
    previous.quote &&
    previous.quote.sourceMessageId > (incoming.quote?.sourceMessageId ?? 0)
      ? previous.quote
      : incoming.quote;
  const trade =
    previous.trade &&
    previous.trade.sourceMessageId > (incoming.trade?.sourceMessageId ?? 0)
      ? previous.trade
      : incoming.trade;
  return {
    ...incoming,
    quote,
    trade,
    revision: Math.max(previous.revision, incoming.revision),
    tradeQuoteDifference: compareTradeToQuote(
      trade?.compactPrice ?? null,
      quote?.compactPrice ?? null,
    ),
  };
}

export function applyMarketEvent(
  snapshot: MarketSnapshot,
  event: MarketLiveEvent,
): MarketSnapshot {
  if (event.type !== "QUOTE" && event.type !== "TRADE") return snapshot;
  if (
    event.type === "QUOTE" &&
    event.sourceMessageId <= (snapshot.quote?.sourceMessageId ?? 0)
  )
    return snapshot;
  if (
    event.type === "TRADE" &&
    event.sourceMessageId <= (snapshot.trade?.sourceMessageId ?? 0)
  )
    return snapshot;
  const quote =
    event.type === "QUOTE"
      ? {
          compactPrice: event.compactPrice,
          sourceMessageId: event.sourceMessageId,
          announcedAt: event.announcedAt,
        }
      : snapshot.quote;
  const trade =
    event.type === "TRADE"
      ? {
          compactPrice: event.compactPrice,
          sourceMessageId: event.sourceMessageId,
          announcedAt: event.announcedAt,
          id: event.id,
          quantity: event.quantity,
        }
      : snapshot.trade;
  return {
    quote,
    trade,
    revision: Math.max(snapshot.revision, event.revision),
    asOf: snapshot.asOf,
    tradeQuoteDifference: compareTradeToQuote(
      trade?.compactPrice ?? null,
      quote?.compactPrice ?? null,
    ),
  };
}
