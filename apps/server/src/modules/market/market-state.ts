import { marketSnapshotSchema, type MarketSnapshot } from "@zarbit/contracts";
import { compareTradeToQuote } from "@zarbit/domain";
import type { Store } from "@zarbit/db";

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
      .then((loaded) => {
        const { quote } = loaded;
        const legacy = loaded as typeof loaded & {
          trade?: (typeof loaded.recentTrades)[number] | null;
        };
        const recentTrades =
          loaded.recentTrades ?? (legacy.trade ? [legacy.trade] : []);
        const previous = this.value;
        const nextQuote = quote
          ? {
              compactPrice: quote.compactQuote,
              announcedAt: quote.announcedAt.toISOString(),
              sourceMessageId: quote.sourceMessageId,
            }
          : null;
        const nextTrades = recentTrades.map((trade) => ({
          ...trade,
          announcedAt: trade.announcedAt.toISOString(),
        }));
        const nextTrade = nextTrades[0] ?? null;
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
          recentTrades: nextTrades,
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
}
