import { Card, Chip, cn } from "@heroui/react";
import type { ParticipantAnalyticsSummary } from "@zarbit/contracts";
import { DataCoverageBadge } from "./_data-coverage-badge";

function formatPersianNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

export function TraderCard({
  trader,
  rank,
  onSelect,
}: {
  trader: ParticipantAnalyticsSummary;
  rank: number;
  onSelect: (alias: string) => void;
}) {
  const isProfitable = trader.realizedPnlPoints > 0;
  const isLoss = trader.realizedPnlPoints < 0;

  return (
    <Card
      onClick={() => onSelect(trader.alias)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(trader.alias);
        }
      }}
      className="border-border bg-surface shadow-surface hover:border-accent/40 group relative w-full cursor-pointer rounded-2xl border p-4 text-right transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side: P&L */}
        <div className="text-left">
          <div
            className={cn(
              "dir-ltr text-base font-bold tracking-tight",
              isProfitable && "text-success",
              isLoss && "text-danger",
              !isProfitable && !isLoss && "text-muted",
            )}
          >
            {isProfitable ? "+" : ""}
            {formatPersianNumber(trader.realizedPnlTomans)}
            <span className="text-muted mr-1 text-xs font-normal">تومان</span>
          </div>
          <div className="text-muted dir-ltr text-xs">
            {isProfitable ? "+" : ""}
            {formatPersianNumber(trader.realizedPnlPoints)} پوینت
          </div>
        </div>

        {/* Right side: Rank & Alias */}
        <div className="flex items-center gap-3">
          <span className="bg-surface-secondary text-muted flex size-7 shrink-0 items-center justify-center rounded-xl text-xs font-semibold">
            {formatPersianNumber(rank)}
          </span>
          <div>
            <div className="text-foreground text-base font-semibold">
              {trader.alias}
            </div>
            <DataCoverageBadge
              confidence={trader.confidence}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="border-border/60 text-muted mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
        <div className="flex items-center gap-2">
          <span>حجم:</span>
          <span className="text-foreground font-semibold">
            {formatPersianNumber(trader.totalVolume)} واحد
          </span>
          <span className="text-border">|</span>
          <span>معاملات:</span>
          <span className="text-foreground font-semibold">
            {formatPersianNumber(trader.totalTrades)}
          </span>
        </div>

        <div>
          {trader.observedPosition === 0 ? (
            <Chip
              size="sm"
              variant="soft"
              color="default"
              className="text-[11px]"
            >
              موقعیت باز: بسته
            </Chip>
          ) : trader.observedPosition > 0 ? (
            <Chip
              size="sm"
              variant="soft"
              color="success"
              className="text-[11px]"
            >
              خرید: +{formatPersianNumber(trader.observedPosition)}
            </Chip>
          ) : (
            <Chip
              size="sm"
              variant="soft"
              color="danger"
              className="text-[11px]"
            >
              فروش: {formatPersianNumber(trader.observedPosition)}
            </Chip>
          )}
        </div>
      </div>
    </Card>
  );
}
