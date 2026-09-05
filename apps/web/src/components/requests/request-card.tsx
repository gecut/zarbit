import { Button, Card, Chip } from "@heroui/react";
import { PenIcon } from "@solar-icons/react/linear/pen";
import { useNavigate } from "@tanstack/react-router";

import type { ZarbitRequest } from "../../lib/api";
import { useCancelRequest } from "../../lib/requests";
import { ConfirmAction } from "../confirm-action";
import { ActionIcon, actionLabels, conditionLabels, formatPrice } from "./request-labels";
import { RequestStatusChip } from "./request-status-chip";

type RequestCardProps = {
  request: ZarbitRequest;
  allowActions?: boolean;
};

export function RequestCard({ request, allowActions = false }: RequestCardProps) {
  const cancel = useCancelRequest();
  const navigate = useNavigate();
  return (
    <article>
      <Card className="overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-surface p-4 shadow-surface">
        <div className="flex items-center justify-between gap-3">
          <strong className="flex min-w-0 items-center gap-[0.55rem] font-semibold"><span aria-hidden="true" className="grid size-[2.15rem] shrink-0 place-items-center rounded-[var(--radius-2xl)] bg-accent-soft text-accent"><ActionIcon action={request.action} /></span>{actionLabels[request.action]}</strong>
          {request.isExecuting ? <Chip className="shrink-0 whitespace-nowrap" color="warning" size="sm" variant="soft">در حال اجرا</Chip> : <RequestStatusChip status={request.status} />}
        </div>
        <p className="mt-[0.8rem] mb-[0.15rem] text-right text-xl font-semibold tracking-[-0.035em] text-foreground" dir="ltr">{formatPrice(request.targetPrice)}</p>
        <p className="m-0 text-xs text-muted">{conditionLabels[request.condition]}</p>
        <div className="mt-[0.9rem] flex flex-wrap gap-x-4 gap-y-[0.45rem] border-t border-separator pt-[0.8rem] text-xs text-muted">{request.units ? <span>تعداد: {request.units} واحد</span> : <span>فقط هشدار</span>}{request.triggeredQuote ? <span>مظنه اجرا: {formatPrice(request.triggeredQuote)}</span> : null}</div>
        {request.failureReason ? <p className="mt-[0.65rem] text-xs leading-7 text-danger-soft-foreground">{request.failureReason}</p> : null}
        {request.cancellationReason ? <p className="mt-[0.65rem] text-xs leading-7 text-danger-soft-foreground">{request.cancellationReason}</p> : null}
        {allowActions && !request.isExecuting ? <div className="mt-[0.95rem] grid grid-cols-2 gap-[0.55rem]"><Button className="min-h-[2.4rem] text-xs font-semibold" onPress={() => navigate({ to: "/requests/$id/edit", params: { id: request.id } })}><PenIcon size={17} />ویرایش</Button><ConfirmAction description="درخواست لغوشده دوباره فعال نمی‌شود." label="لغو درخواست" onConfirm={() => cancel.mutateAsync(request.id)} pending={cancel.isPending} title="درخواست لغو شود؟" /></div> : null}
        {cancel.error ? <p role="alert" className="-mt-1 flex items-start gap-2 text-xs leading-7 text-danger-soft-foreground">{cancel.error.message}</p> : null}
        <div className="mt-[0.9rem] flex flex-wrap gap-x-4 gap-y-[0.45rem] border-t border-separator pt-[0.8rem] text-xs text-muted"><span>ثبت: {new Date(request.createdAt).toLocaleString("fa-IR")}</span>{request.completedAt ? <span>پایان: {new Date(request.completedAt).toLocaleString("fa-IR")}</span> : null}</div>
      </Card>
    </article>
  );
}
