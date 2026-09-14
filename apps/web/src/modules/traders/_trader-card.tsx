import { Card, Chip, cn } from "@heroui/react";
import type { ParticipantAnalyticsSummary } from "@zarbit/contracts";
import { formatNumber } from "@zarbit/format";
import { DataCoverageBadge } from "./_data-coverage-badge";
import TomanIcon from "@/shared/ui/_toman-icon";

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
    >
      <Card.Content className="flex flex-row items-start justify-between gap-2">
        <div className="flex gap-2">
          <span className="bg-surface-secondary text-muted flex size-8 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold">
            {rank}
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

        <div className="text-left">
          <div
            className={cn(
              "flex items-center gap-1 text-base font-bold tracking-tight",
              isProfitable && "text-success",
              isLoss && "text-danger",
              !isProfitable && !isLoss && "text-muted",
            )}
          >
            {formatNumber(trader.realizedPnlTomans)}
            {isProfitable ? "+" : ""}

            <TomanIcon className="text-muted mb-1 size-4" />
          </div>
        </div>
      </Card.Content>

      <Card.Footer className="border-border/60 text-muted flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
        <div className="flex items-center gap-2">
          <span>حجم:</span>
          <span className="text-foreground font-semibold">
            {formatNumber(trader.totalVolume)} واحد
          </span>
          <span className="text-border">|</span>
          <span>معاملات:</span>
          <span className="text-foreground font-semibold">
            {formatNumber(trader.totalTrades)}
          </span>
        </div>

        <div>
          {trader.observedPosition === 0 ? (
            <Chip
              size="sm"
              variant="soft"
              color="default"
              className="px-2 text-xs font-light"
            >
              موقعیت باز: بسته
            </Chip>
          ) : trader.observedPosition > 0 ? (
            <Chip
              size="sm"
              variant="soft"
              color="success"
              className="px-2 text-xs font-light"
            >
              خرید: {formatNumber(trader.observedPosition)}+
            </Chip>
          ) : (
            <Chip
              size="sm"
              variant="soft"
              color="danger"
              className="px-2 text-xs font-light"
            >
              فروش: {formatNumber(trader.observedPosition)}
            </Chip>
          )}
        </div>
      </Card.Footer>
    </Card>
  );
}
