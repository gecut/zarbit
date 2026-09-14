import { HomeRequestSection } from "./_home-request-section";
import { useMarket } from "./_use-market";
import { TerminalQuoteHeader } from "./_terminal-quote-header";
import { RecentTradesTape } from "./_recent-trades-tape";

export function HomePage() {
  const market = useMarket();

  return (
    <div className="flex flex-col gap-6">
      <TerminalQuoteHeader
        data={market.snapshot.data}
        connection={market.connection}
        isPending={market.snapshot.isPending}
        isFetching={market.snapshot.isFetching}
        error={market.snapshot.error}
        onRefresh={() => void market.snapshot.refetch()}
      />

      <HomeRequestSection
        currentQuote={market.snapshot.data?.quote?.compactPrice}
      />

      <RecentTradesTape data={market.snapshot.data} />
    </div>
  );
}
