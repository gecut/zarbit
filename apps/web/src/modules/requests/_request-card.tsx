import { Card, Chip, cn } from "@heroui/react";
import type { RequestDetail } from "@zarbit/contracts";

import {
  actionIcons,
  actionLabels,
  conditionShortLabels,
  formatNumber,
  requestStatusLabel,
} from "./_request-view-model";
import {
  DollarMinimalisticIcon,
  SquareTopDownIcon,
} from "@solar-icons/react/linear";
import TomanIcon from "@/shared/ui/_toman-icon";

function actionColorClassName(action: RequestDetail["action"]) {
  switch (action) {
    case "ALERT":
      return "text-warning";
    case "BUY":
      return "text-success";
    case "SELL":
      return "text-danger";

    default:
      return "text-accent";
  }
}

function cardFromColorClassName(action: RequestDetail["action"]) {
  switch (action) {
    case "ALERT":
      return "from-warning/10";
    case "BUY":
      return "from-success/10";
    case "SELL":
      return "from-danger/8";

    default:
      return "from-accent/5";
  }
}

function cardToColorClassName(status: RequestDetail["status"]) {
  switch (status) {
    case "ACTIVE":
      return "to-accent/10";
    case "DONE":
      return "to-success/10";
    case "CANCELLED":
      return "to-danger/5";
    case "FAILED":
      return "to-danger/10";
    case "UNKNOWN":
      return "to-default/10";

    default:
      return "to-accent/5";
  }
}

export function RequestCard({
  row,
  onDetails,
}: {
  row: RequestDetail;
  onDetails: () => void;
}) {
  const ActionIcon = actionIcons[row.action];
  const actionLabel = actionLabels[row.action];
  const conditionLabel = conditionShortLabels[row.condition];

  return (
    <Card
      onClick={onDetails}
      className={cn(
        "bg-surface bg-linear-210 via-surface to-surface cursor-pointer",
        cardFromColorClassName(row.action),
        cardToColorClassName(row.status),
      )}
    >
      <div className="flex w-full items-center">
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center">
            <ActionIcon
              className={cn("me-2 size-5", actionColorClassName(row.action))}
            />

            <span className="text-muted me-1 text-sm">{actionLabel}</span>

            {row.action !== "ALERT" && row.units != null && (
              <span className="text-foreground text-sm">
                {formatNumber(row.units)} واحد
              </span>
            )}
          </div>

          <div className="flex items-center">
            <DollarMinimalisticIcon className="text-muted me-2 size-5" />

            <div className="text-muted me-1 text-sm">
              قیمت <span className="text-foreground">{conditionLabel}</span> از
            </div>

            <span className="text-foreground me-1 text-sm font-semibold tabular-nums">
              {formatNumber(row.targetPrice)}
            </span>

            <TomanIcon className="text-muted size-3 opacity-70" />
          </div>
        </div>

        <div className="flex h-full flex-col items-end justify-between">
          <SquareTopDownIcon className="text-muted size-5" />

          <Chip
            color={
              row.status === "ACTIVE"
                ? "accent"
                : row.status === "DONE"
                  ? "success"
                  : "danger"
            }
            variant="soft"
            className="text-xs"
          >
            {requestStatusLabel(row.status)}
          </Chip>
        </div>
      </div>
    </Card>
  );
}
