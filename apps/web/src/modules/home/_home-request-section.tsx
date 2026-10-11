import { useState } from "react";
import type { CreateRequestInput } from "@zarbit/contracts";
import { RequestsPage } from "../requests/requests-page";
import { ExecutionStrip } from "./_execution-strip";
import { AlertDialog, Button, Card } from "@heroui/react";
import { CloseCircleIcon } from "@solar-icons/react/linear";
import { useQuery } from "@tanstack/react-query";
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { useRequestActions } from "../requests/_use-request-actions";
import { formatNumber, userMessage } from "../requests/_request-view-model";

interface HomeRequestSectionProps {
  currentTradePrice?: number;
}

export function HomeRequestSection({
  currentTradePrice,
}: HomeRequestSectionProps) {
  const [createRequestOpen, setCreateRequestOpen] = useState(false);
  const [createAction, setCreateAction] =
    useState<CreateRequestInput["action"]>("BUY");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identity = useIdentity();
  const api = useApi(identity.telegramUserId);
  const { cancelAll } = useRequestActions();

  const activeQuery = useQuery(api.requests.active.queryOptions());
  const activeRequests = activeQuery.data ?? [];
  const hasActiveRequests = activeRequests.length > 0;

  const handleActionSelect = (action: CreateRequestInput["action"]) => {
    setCreateAction(action);
    setCreateRequestOpen(true);
  };

  const handleConfirmCancelAll = async () => {
    try {
      setError(null);
      await cancelAll.mutateAsync();
      setConfirmModalOpen(false);
    } catch (err) {
      setError(userMessage(err));
    }
  };

  return (
    <>
      <Card>
        <Card.Header className="gap-4">
          <div className="flex items-center justify-between">
            <Card.Title>درخواست های فعال</Card.Title>
            <Button
              size="sm"
              variant="danger-soft"
              isDisabled={!hasActiveRequests || cancelAll.isPending}
              onPress={() => {
                setError(null);
                setConfirmModalOpen(true);
              }}
              className="h-7 gap-1 rounded-xl px-2.5 text-xs font-semibold"
            >
              <CloseCircleIcon className="size-3.5" />
              <span>لغو همه</span>
            </Button>
          </div>
          <ExecutionStrip onActionSelect={handleActionSelect} />
        </Card.Header>

        <RequestsPage
          createOpen={createRequestOpen}
          onOpenCreateChange={setCreateRequestOpen}
          initialAction={createAction}
          currentTradePrice={currentTradePrice}
        />
      </Card>

      <AlertDialog isOpen={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog dir="rtl">
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  لغو همهٔ درخواست‌های فعال
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-muted text-xs leading-relaxed">
                  آیا از لغو تمامی درخواست‌های فعال خود (
                  {formatNumber(activeRequests.length)} درخواست) اطمینان دارید؟
                  پس از لغو، شرط این درخواست‌ها دیگر بررسی نخواهد شد.
                </p>
                {error ? (
                  <p
                    role="alert"
                    className="border-danger bg-danger-soft text-danger-soft-foreground mt-3 rounded-xl border px-3 py-2 text-xs"
                  >
                    {error}
                  </p>
                ) : null}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  isDisabled={cancelAll.isPending}
                  onPress={() => setConfirmModalOpen(false)}
                  className="flex-1 grow"
                  variant="secondary"
                >
                  انصراف
                </Button>
                <Button
                  isDisabled={cancelAll.isPending}
                  isPending={cancelAll.isPending}
                  onPress={handleConfirmCancelAll}
                  className="flex-1 grow"
                  variant="danger"
                >
                  لغو همه درخواست‌ها
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
