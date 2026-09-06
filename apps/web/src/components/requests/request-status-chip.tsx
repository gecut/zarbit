import { Chip } from "@heroui/react";

import type { RequestStatus } from "../../lib/api";
import { statusLabels } from "./request-labels";

type RequestStatusChipProps = {
  status: RequestStatus;
};

export function RequestStatusChip({ status }: RequestStatusChipProps) {
  const color =
    status === "ACTIVE" ? "success" : status === "DONE" ? "accent" : "danger";

  return (
    <Chip
      className="shrink-0 whitespace-nowrap"
      color={color}
      size="sm"
      variant="soft"
    >
      <span aria-hidden="true">{status === "ACTIVE" ? "●" : "•"}</span>
      {statusLabels[status]}
    </Chip>
  );
}
