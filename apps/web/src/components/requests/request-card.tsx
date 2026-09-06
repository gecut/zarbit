import { Button, Card, Chip } from "@heroui/react";
import { PenIcon } from "@solar-icons/react/linear/pen";
import { useNavigate } from "@tanstack/react-router";

import type { ZarbitRequest } from "../../lib/api";
import { useCancelRequest } from "../../lib/requests";
import { ConfirmAction } from "../confirm-action";
import {
  ActionIcon,
  actionLabels,
  conditionLabels,
  formatPrice,
} from "./request-labels";
import { RequestStatusChip } from "./request-status-chip";

type RequestCardProps = {
  request: ZarbitRequest;
  allowActions?: boolean;
};

export function RequestCard({
  request,
  allowActions = false,
}: RequestCardProps) {
  const cancel = useCancelRequest();
  const navigate = useNavigate();
  return (
    <article>
      <Card className="border-border bg-surface shadow-surface overflow-hidden rounded-[var(--radius-2xl)] border p-4">
        <div className="flex items-center justify-between gap-3">
          <strong className="flex min-w-0 items-center gap-[0.55rem] font-semibold">
            <span
              aria-hidden="true"
              className="bg-accent-soft text-accent grid size-[2.15rem] shrink-0 place-items-center rounded-[var(--radius-2xl)]"
            >
              <ActionIcon action={request.action} />
            </span>
            {actionLabels[request.action]}
          </strong>
          {request.isExecuting ? (
            <Chip
              className="shrink-0 whitespace-nowrap"
              color="warning"
              size="sm"
              variant="soft"
            >
              در حال اجرا
            </Chip>
          ) : (
            <RequestStatusChip status={request.status} />
          )}
        </div>
        <p
          className="text-foreground mb-[0.15rem] mt-[0.8rem] text-right text-xl font-semibold tracking-[-0.035em]"
          dir="ltr"
        >
          {formatPrice(request.targetPrice)}
        </p>
        <p className="text-muted m-0 text-xs">
          {conditionLabels[request.condition]}
        </p>
        <div className="border-separator text-muted mt-[0.9rem] flex flex-wrap gap-x-4 gap-y-[0.45rem] border-t pt-[0.8rem] text-xs">
          {request.units ? (
            <span>تعداد: {request.units} واحد</span>
          ) : (
            <span>فقط هشدار</span>
          )}
          {request.triggeredQuote ? (
            <span>مظنه اجرا: {formatPrice(request.triggeredQuote)}</span>
          ) : null}
        </div>
        {request.failureReason ? (
          <p className="text-danger-soft-foreground mt-[0.65rem] text-xs leading-7">
            {request.failureReason}
          </p>
        ) : null}
        {request.cancellationReason ? (
          <p className="text-danger-soft-foreground mt-[0.65rem] text-xs leading-7">
            {request.cancellationReason}
          </p>
        ) : null}
        {allowActions && !request.isExecuting ? (
          <div className="mt-[0.95rem] grid grid-cols-2 gap-[0.55rem]">
            <Button
              className="min-h-[2.4rem] text-xs font-semibold"
              onPress={() =>
                navigate({
                  to: "/requests/$id/edit",
                  params: { id: request.id },
                })
              }
            >
              <PenIcon size={17} />
              ویرایش
            </Button>
            <ConfirmAction
              description="درخواست لغوشده دوباره فعال نمی‌شود."
              label="لغو درخواست"
              onConfirm={() => cancel.mutateAsync(request.id)}
              pending={cancel.isPending}
              title="درخواست لغو شود؟"
            />
          </div>
        ) : null}
        {cancel.error ? (
          <p
            role="alert"
            className="text-danger-soft-foreground -mt-1 flex items-start gap-2 text-xs leading-7"
          >
            {cancel.error.message}
          </p>
        ) : null}
        <div className="border-separator text-muted mt-[0.9rem] flex flex-wrap gap-x-4 gap-y-[0.45rem] border-t pt-[0.8rem] text-xs">
          <span>
            ثبت: {new Date(request.createdAt).toLocaleString("fa-IR")}
          </span>
          {request.completedAt ? (
            <span>
              پایان: {new Date(request.completedAt).toLocaleString("fa-IR")}
            </span>
          ) : null}
        </div>
      </Card>
    </article>
  );
}
