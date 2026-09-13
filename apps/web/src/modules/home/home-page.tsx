import { QuoteAge } from "./_quote-age";
import { RequestList } from "../requests";
import { MarketSummary } from "./_market-summary";
import { useMarket } from "./_use-market";

export function HomePage() {
  const market = useMarket();

  return (
    <div className="grid gap-6">
      <section className="border-accent/20 bg-surface shadow-surface grid gap-5 rounded-3xl border p-4 sm:p-5">
        {market.connection === "degraded" && (
          <p
            role="status"
            className="bg-warning-soft text-warning-soft-foreground rounded-xl px-3 py-2 text-xs"
          >
            ارتباط زنده قطع است؛ قیمت‌ها به‌صورت دوره‌ای تازه می‌شوند.
          </p>
        )}
        <QuoteAge announcedAt={market.snapshot.data?.quote?.announcedAt} />
        <MarketSummary
          data={market.snapshot.data}
          pending={market.snapshot.isPending}
          error={market.snapshot.error}
          retry={() => void market.snapshot.refetch()}
        />
      </section>
      <RequestList />
    </div>
  );
}
