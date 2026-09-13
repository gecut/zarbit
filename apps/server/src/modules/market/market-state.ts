import {
  marketSnapshotSchema,
  type MarketSnapshot,
  type MarketLiveEvent,
} from "@zarbit/contracts";
import { compareTradeToQuote } from "@zarbit/domain";
import type { Store } from "@zarbit/db";

type IncrementalEvent = Extract<MarketLiveEvent, { type: "QUOTE" | "TRADE" }>;

export class MarketState {
  private value: MarketSnapshot | null = null;
  private flight: Promise<MarketSnapshot> | null = null;
  private verifiedAt = 0;
  connected = false;

  constructor(
    private readonly load: () => ReturnType<Store["marketHeads"]>,
    private readonly observe: (event: string) => void = () => undefined,
  ) {}
  get revision(): number {
    return this.value?.revision ?? 0;
  }

  read(force = false): Promise<MarketSnapshot> {
    // Periodic authoritative verification also repairs a lost notification.
    const lifetime = this.connected ? 60_000 : 5_000;
    if (!force && this.value && Date.now() - this.verifiedAt < lifetime) {
      this.observe("warm");
      return Promise.resolve(this.value);
    }
    if (this.flight) return this.flight;
    this.observe("hydrate");
    this.flight = this.load()
      .then(({ quote, trade }) => {
        const previous = this.value;
        const nextQuote = quote
          ? {
              compactPrice: quote.compactQuote,
              announcedAt: quote.announcedAt.toISOString(),
              sourceMessageId: quote.sourceMessageId,
            }
          : null;
        const nextTrade = trade
          ? { ...trade, announcedAt: trade.announcedAt.toISOString() }
          : null;
        // A notification can arrive while the hydration query is in flight.
        const q =
          previous?.quote &&
          previous.quote.sourceMessageId > (nextQuote?.sourceMessageId ?? 0)
            ? previous.quote
            : nextQuote;
        const t =
          previous?.trade &&
          previous.trade.sourceMessageId > (nextTrade?.sourceMessageId ?? 0)
            ? previous.trade
            : nextTrade;
        this.value = marketSnapshotSchema.parse({
          quote: q,
          trade: t,
          revision: Math.max(q?.sourceMessageId ?? 0, t?.sourceMessageId ?? 0),
          tradeQuoteDifference: compareTradeToQuote(
            t?.compactPrice ?? null,
            q?.compactPrice ?? null,
          ),
          asOf: new Date().toISOString(),
        });
        this.verifiedAt = Date.now();
        return this.value;
      })
      .finally(() => {
        this.flight = null;
      });
    return this.flight;
  }

  apply(event: IncrementalEvent): boolean {
    if (!this.value) return false;
    const head = event.type === "QUOTE" ? this.value.quote : this.value.trade;
    if (head && event.sourceMessageId <= head.sourceMessageId) return false;
    const { type, revision: _revision, ...point } = event;
    const quote = type === "QUOTE" ? point : this.value.quote;
    const trade = type === "TRADE" && "id" in point ? point : this.value.trade;
    this.value = marketSnapshotSchema.parse({
      quote,
      trade,
      revision: Math.max(this.value.revision, event.sourceMessageId),
      tradeQuoteDifference: compareTradeToQuote(
        trade?.compactPrice ?? null,
        quote?.compactPrice ?? null,
      ),
      asOf: new Date().toISOString(),
    });
    return true;
  }
}
