import { useQuery, skipToken } from "@tanstack/react-query";
import { useIdentity } from "../../shared/auth/auth";
import { useRequestActions } from "./_use-request-actions";
import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { DocumentTextIcon } from "@solar-icons/react/linear/document-text";
import type { RequestDetail } from "@zarbit/contracts";

import { useApi } from "../../shared/api/api-context";
import { DrawerSheet } from "../../shared/ui/drawer";
import {
  actionLabels,
  conditionLabels,
  formatDate,
  formatNumber,
  requestStatusLabel,
  userMessage,
} from "./_request-view-model";

export function RequestDetailsDrawer({
  request: initialRequest,
  requestId,
  onClose,
}: {
  request: RequestDetail | null;
  requestId?: string;
  onClose: () => void;
}) {
  const api = useApi(useIdentity().telegramUserId);
  const { cancel, forceSend } = useRequestActions();
  const selectedId = requestId ?? initialRequest?.id;
  const detail = useQuery(
    api.requests.detail.queryOptions({
      input: selectedId ? { id: selectedId } : skipToken,
      initialData: initialRequest ?? undefined,
      initialDataUpdatedAt: 0,
      refetchInterval: (query) =>
        query.state.data?.status === "ACTIVE" ? 3000 : false,
    }),
  );
  const request = detail.isError ? null : (detail.data ?? initialRequest);
  const [pending, setPending] = useState<"send" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setPending(null);
  }, [selectedId]);

  const runAction = async (action: "send" | "cancel") => {
    if (!request) return;
    setPending(action);
    setError(null);
    try {
      if (action === "send") await forceSend.mutateAsync({ id: request.id });
      else await cancel.mutateAsync({ id: request.id });
      onClose();
    } catch (actionError) {
      setError(userMessage(actionError));
    } finally {
      setPending(null);
    }
  };

  return (
    <DrawerSheet
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={!!selectedId}
      icon={<DocumentTextIcon size={22} />}
      title="جزئیات درخواست"
      description={
        request
          ? `${actionLabels[request.action]} با قیمت هدف ${formatNumber(request.targetPrice)}`
          : undefined
      }
      footer={
        request?.status === "ACTIVE" ? (
          <div className="flex w-full justify-between gap-2">
            <Button
              data-base-ui-swipe-ignore
              isPending={pending === "send"}
              isDisabled={pending !== null || request.executing}
              onPress={() => void runAction("send")}
              variant="secondary"
            >
              ارسال فوری
            </Button>
            <Button
              data-base-ui-swipe-ignore
              isDisabled={pending !== null}
              onPress={() => void runAction("cancel")}
              variant="danger-soft"
            >
              لغو درخواست
            </Button>
          </div>
        ) : selectedId ? (
          <Button
            data-base-ui-swipe-ignore
            fullWidth
            onPress={onClose}
            variant="tertiary"
          >
            بستن
          </Button>
        ) : null
      }
    >
      {selectedId && detail.isPending ? (
        <p role="status">در حال دریافت جزئیات درخواست…</p>
      ) : null}
      {selectedId && detail.isError ? (
        <div role="alert">
          <p>
            جزئیات درخواست در دسترس نیست؛ ممکن است حذف شده باشد یا به آن دسترسی
            نداشته باشید.
          </p>
          <Button variant="secondary" onPress={() => void detail.refetch()}>
            تلاش دوباره
          </Button>
        </div>
      ) : null}
      {request ? (
        <>
          <dl className="grid gap-3 text-sm">
            <DetailRow
              label="نوع درخواست"
              value={actionLabels[request.action]}
            />
            <DetailRow
              label="وضعیت"
              value={requestStatusLabel(request.status)}
            />
            <DetailRow
              label="شرط اجرا"
              value={conditionLabels[request.condition]}
            />
            <DetailRow
              label="قیمت هدف"
              value={formatNumber(request.targetPrice)}
            />
            <DetailRow
              label="تعداد"
              value={
                request.units ? `${formatNumber(request.units)} واحد` : "ندارد"
              }
            />
            <DetailRow label="زمان ثبت" value={formatDate(request.createdAt)} />
            <DetailRow
              label="آخرین تغییر"
              value={formatDate(request.updatedAt)}
            />
            <DetailRow
              label="زمان تکمیل"
              value={formatDate(request.completedAt)}
            />
            <DetailRow
              label="قیمت اجرا"
              value={
                request.triggeredQuote
                  ? formatNumber(request.triggeredQuote)
                  : "—"
              }
            />
            {request.failureReason ? (
              <DetailRow label="علت خطا" value={request.failureReason} />
            ) : null}
            {request.cancellationReason ? (
              <DetailRow label="علت لغو" value={request.cancellationReason} />
            ) : null}
          </dl>
          {error ? (
            <p className="border-danger bg-danger-soft text-danger-soft-foreground mt-4 rounded-xl border px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </DrawerSheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-separator flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-foreground wrap-break-word text-left font-medium">
        {value}
      </dd>
    </div>
  );
}
