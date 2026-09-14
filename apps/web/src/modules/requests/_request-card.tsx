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
import { formatRelativeDateTime } from "@zarbit/format";

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
    >
      <Card.Header className="flex w-full flex-row items-center justify-between">
        <Chip
          color={
            row.action === "BUY"
              ? "success"
              : row.action === "SELL"
                ? "danger"
                : "warning"
          }
          variant="soft"
        >
          <ActionIcon className="me-1 inline-block size-4" />
          <Chip.Label>{actionLabel}</Chip.Label>
        </Chip>

        <Chip
          color={
            row.status === "ACTIVE"
              ? "accent"
              : row.status === "DONE"
                ? "success"
                : "danger"
          }
          variant="soft"
        >
          <Chip.Label>{requestStatusLabel(row.status)}</Chip.Label>
        </Chip>
      </Card.Header>

      <Card.Content className="flex w-full flex-row items-end justify-between gap-2.5">
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {row.action !== "ALERT" && row.units != null && (
            <span className="text-foreground font-semibold">
              {formatNumber(row.units)} واحد
            </span>
          )}

          <div className="text-muted flex items-center gap-1">
            <span>مظنه {conditionLabel} از</span>

            <strong className="text-foreground font-bold">
              {formatNumber(row.targetPrice)}
            </strong>

            <TomanIcon className="size-4 opacity-80" />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-2">
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

          {row.completedAt && (
            <time className="text-muted text-xs">
              {formatRelativeDateTime(row.completedAt)}
            </time>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
