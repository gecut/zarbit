import { Button, Card, Chip } from "@heroui/react";
import type { RequestDetail } from "@zarbit/contracts";
import {
  actionIcons,
  actionLabels,
  conditionShortLabels,
  formatNumber,
  requestStatusLabel,
} from "./_request-view-model";
import TomanIcon from "@/shared/ui/_toman-icon";

export interface RequestCardProps {
  row: RequestDetail;
  onDetails: () => void;
  currentQuote?: number;
  compact?: boolean;
}

export function RequestCard({
  row,
  onDetails,
  currentQuote,
  compact = false,
}: RequestCardProps) {
  const ActionIcon = actionIcons[row.action];
  const actionLabel = actionLabels[row.action];
  const conditionLabel = conditionShortLabels[row.condition];

  // Calculate distance from live quote
  const distance =
    currentQuote != null && Number.isFinite(currentQuote)
      ? row.targetPrice - currentQuote
      : null;

  const isTriggeredOrInRange =
    distance != null &&
    ((row.condition === "LTE" && distance >= 0) ||
      (row.condition === "GTE" && distance <= 0));

  if (compact) {
    return (
      <article className="border-separator grid gap-1 border-b py-2 text-xs last:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Chip
              size="sm"
              color={
                row.action === "BUY"
                  ? "success"
                  : row.action === "SELL"
                    ? "danger"
                    : "default"
              }
              variant="soft"
            >
              <Chip.Label>{actionLabel}</Chip.Label>
            </Chip>
            {row.action !== "ALERT" && row.units != null && (
              <b className="tabular-nums">{formatNumber(row.units)} واحد</b>
            )}
            <span>{requestStatusLabel(row.status)}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onPress={onDetails}
            aria-label={`جزئیات ${actionLabel} در مظنه ${formatNumber(row.targetPrice)}`}
          >
            جزئیات
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>
            مظنه {row.condition === "LTE" ? "کمتر یا مساوی" : "بیشتر یا مساوی"}{" "}
            <b className="tabular-nums">{formatNumber(row.targetPrice)}</b>
          </span>
          {distance != null && row.status === "ACTIVE" && (
            <span className="text-muted tabular-nums">
              فاصله هدف:{" "}
              <bdi dir="ltr">
                {distance > 0 ? "+" : ""}
                {formatNumber(distance)}
              </bdi>{" "}
              هزار تومان
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onDetails}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDetails();
        }
      }}
      variant="secondary"
      className="border-border/60 hover:bg-surface-secondary/90 hover:border-border focus-visible:outline-3 focus-visible:outline-focus cursor-pointer rounded-xl border p-2.5 transition-colors focus-visible:outline-offset-2 active:scale-[0.99] sm:p-3"
    >
      <div className="flex w-full items-center justify-between gap-2.5">
        {/* Left/Start Side: Action Chip, Units, Price Target */}
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Chip
            size="sm"
            color={
              row.action === "BUY"
                ? "success"
                : row.action === "SELL"
                  ? "danger"
                  : "warning"
            }
            variant="soft"
            className="h-5.5 px-1.5 text-[0.7rem] font-bold"
          >
            <ActionIcon className="me-1 inline-block size-3.5" />
            <Chip.Label>{actionLabel}</Chip.Label>
          </Chip>

          {row.action !== "ALERT" && row.units != null && (
            <span className="text-foreground font-semibold tabular-nums">
              {formatNumber(row.units)} واحد
            </span>
          )}

          <div className="text-muted flex items-center gap-1">
            <span>مظنه {conditionLabel} از</span>
            <strong className="text-foreground font-mono font-bold tabular-nums">
              {formatNumber(row.targetPrice)}
            </strong>
            <TomanIcon className="size-3 opacity-80" />
          </div>
        </div>

        {/* Right/End Side: Quote Distance & Status */}
        <div className="flex shrink-0 items-center gap-2">
          {distance != null && row.status === "ACTIVE" && (
            <span
              className={`font-mono text-[0.68rem] tabular-nums ${
                isTriggeredOrInRange
                  ? "text-success font-semibold"
                  : "text-muted"
              }`}
            >
              {isTriggeredOrInRange
                ? "در محدوده هدف"
                : `فاصله: ${distance > 0 ? "+" : ""}${formatNumber(distance)} هزار`}
            </span>
          )}

          <Chip
            color={
              row.status === "ACTIVE"
                ? "accent"
                : row.status === "DONE"
                  ? "success"
                  : "danger"
            }
            variant="soft"
            className="h-5.5 px-2 text-[0.68rem] font-semibold"
          >
            <Chip.Label>{requestStatusLabel(row.status)}</Chip.Label>
          </Chip>
        </div>
      </div>
    </Card>
  );
}
