import { useState } from "react";
import type { CreateRequestInput } from "@zarbit/contracts";
import { RequestList } from "../requests";
import { useMarket } from "./_use-market";
import { TerminalQuoteHeader } from "./_terminal-quote-header";
import { ExecutionStrip } from "./_execution-strip";
import { RecentTradesTape } from "./_recent-trades-tape";

export function HomePage() {
  const market = useMarket();
  const [createRequestOpen, setCreateRequestOpen] = useState(false);
  const [createAction, setCreateAction] =
    useState<CreateRequestInput["action"]>("BUY");

  const handleActionSelect = (action: CreateRequestInput["action"]) => {
    setCreateAction(action);
    setCreateRequestOpen(true);
  };

  const currentQuote = market.snapshot.data?.quote?.compactPrice;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <TerminalQuoteHeader
        data={market.snapshot.data}
        connection={market.connection}
        isPending={market.snapshot.isPending}
        isFetching={market.snapshot.isFetching}
        error={market.snapshot.error}
        onRefresh={() => void market.snapshot.refetch()}
      />

      <ExecutionStrip onActionSelect={handleActionSelect} />

      <RequestList
        createOpen={createRequestOpen}
        onOpenCreateChange={setCreateRequestOpen}
        initialAction={createAction}
        currentQuote={currentQuote}
      />

      <RecentTradesTape data={market.snapshot.data} />
    </div>
  );
}
