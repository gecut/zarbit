import {
  Accordion,
  Alert,
  Button,
  Card,
  Chip,
  ProgressCircle,
  Skeleton,
} from "@heroui/react";
import type { TelegramSessionStatus } from "@zarbit/contracts";
import type { ReactNode } from "react";

import { ConfirmAction } from "./_confirm-action";
import { resolveTelegramSessionPresentation } from "./_session-view-model";

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString("fa-IR")
    : "ثبت نشده";
}

function SessionAlert({ session }: { session: TelegramSessionStatus }) {
  if (session.connection === "OFFLINE") {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>وضعیت ذخیره‌شده است</Alert.Title>
          <Alert.Description>
            سرویس دریافت مظنه در دسترس نیست. اطلاعات اتصال قابل مشاهده است، اما
            فعلاً اقدامی انجام نمی‌شود.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (session.state === "NOT_IN_GROUP") {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>عضویت گروه تأیید نشد</Alert.Title>
          <Alert.Description>
            ابتدا عضویت این حساب در گروه هدف را بررسی کنید، سپس دوباره وضعیت را
            بررسی کنید.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (session.state === "REVOKING") {
    return (
      <Alert status="accent">
        <Alert.Indicator>
          <ProgressCircle
            aria-label="در حال قطع اتصال تلگرام"
            color="accent"
            isIndeterminate
            size="sm"
          />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>در حال قطع اتصال</Alert.Title>
          <Alert.Description>
            دریافت مظنه از این حساب پس از پایان عملیات متوقف می‌شود.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return null;
}

function ConnectionDetails({ session }: { session: TelegramSessionStatus }) {
  const hasDetails =
    session.connectedTelegramUserId ||
    session.groupId !== null ||
    session.quoteSenderId;

  if (!hasDetails) return null;

  return (
    <Accordion className="border-separator border-t pt-2">
      <Accordion.Item>
        <Accordion.Heading>
          <Accordion.Trigger className="text-sm font-semibold">
            جزئیات اتصال
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body className="pb-3">
            <dl className="text-muted grid gap-3 text-xs leading-6">
              {session.connectedTelegramUserId ? (
                <div className="flex items-center justify-between gap-4">
                  <dt>شناسه حساب</dt>
                  <dd className="text-foreground" dir="ltr">
                    <bdi>{session.connectedTelegramUserId}</bdi>
                  </dd>
                </div>
              ) : null}
              {session.groupId === null ? (
                <div className="flex items-center justify-between gap-4">
                  <dt>گروه هدف</dt>
                  <dd className="text-warning">از سرویس دریافت نشد</dd>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <dt>شناسه گروه</dt>
                  <dd className="text-foreground" dir="ltr">
                    <bdi>{session.groupId}</bdi>
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <dt>فرستنده مجاز</dt>
                <dd className="text-foreground" dir="ltr">
                  <bdi>{session.quoteSenderId ?? "نامشخص"}</bdi>
                </dd>
              </div>
            </dl>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function MembershipSummary({ session }: { session: TelegramSessionStatus }) {
  if (session.state !== "ACTIVE" && session.state !== "NOT_IN_GROUP") {
    return null;
  }

  const isMember = session.state === "ACTIVE" && !!session.membershipCheckedAt;
  const label =
    session.state === "NOT_IN_GROUP"
      ? "عضویت تأیید نشده"
      : isMember
        ? "عضویت تأیید شده"
        : "عضویت هنوز بررسی نشده";

  return (
    <Card variant="secondary" className="grid gap-3 text-sm">
      <Card.Content>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">وضعیت گروه</dt>
          <dd className="text-foreground font-semibold">{label}</dd>
        </div>
        <div className="border-separator flex items-center justify-between gap-4 border-t pt-3">
          <dt className="text-muted">آخرین بررسی</dt>
          <dd className="text-foreground text-xs" dir="ltr">
            <bdi>
              {session.membershipCheckedAt
                ? formatDate(session.membershipCheckedAt)
                : "ثبت نشده"}
            </bdi>
          </dd>
        </div>
      </Card.Content>
    </Card>
  );
}

type TelegramSessionPanelProps = {
  commandError: string | null | undefined;
  isLoading: boolean;
  isPending: boolean;
  loadError: string | undefined;
  loginForm?: ReactNode;
  onCheckMembership: () => void;
  onRetry: () => void;
  onRevoke: () => Promise<void>;
  session: TelegramSessionStatus | undefined;
};

export function TelegramSessionPanel({
  commandError,
  isLoading,
  isPending,
  loadError,
  loginForm,
  onCheckMembership,
  onRetry,
  onRevoke,
  session,
}: TelegramSessionPanelProps) {
  const presentation = session
    ? resolveTelegramSessionPresentation(session)
    : null;
  const isActionDisabled = isPending || !presentation?.canManageConnection;

  return (
    <article>
      <Card className="p-4 sm:p-6">
        <Card.Header className="flex items-start justify-between gap-4 p-0">
          <div>
            <Card.Title className="text-lg">
              {presentation?.title ?? "اتصال حساب تلگرام"}
            </Card.Title>
            <Card.Description className="mt-1 max-w-md text-sm leading-7">
              {presentation?.description ??
                "وضعیت اتصال برای دریافت مظنه در حال دریافت است."}
            </Card.Description>
          </div>
          {presentation ? (
            <Chip color={presentation.chip.color} size="sm" variant="soft">
              {presentation.chip.label}
            </Chip>
          ) : null}
        </Card.Header>

        <Card.Content className="mt-6 grid gap-5 p-0">
          {isLoading ? (
            <div className="grid gap-4" role="status">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-12 w-3/5 rounded-xl" />
              <span className="sr-only">در حال دریافت وضعیت اتصال</span>
            </div>
          ) : null}

          {loadError ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>دریافت وضعیت ناموفق بود</Alert.Title>
                <Alert.Description>{loadError}</Alert.Description>
              </Alert.Content>
              <Button onPress={onRetry} size="sm" variant="secondary">
                تلاش دوباره
              </Button>
            </Alert>
          ) : null}

          {session ? (
            <>
              <SessionAlert session={session} />

              <MembershipSummary session={session} />

              {session.error || commandError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>عملیات انجام نشد</Alert.Title>
                    <Alert.Description>
                      {commandError ?? session.error}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <ConnectionDetails session={session} />
              {loginForm}
            </>
          ) : null}
        </Card.Content>

        {presentation?.showConnectionActions ? (
          <Card.Footer className="border-separator grid gap-4 border-t px-0 pb-0 pt-5">
            <div className="grid gap-2">
              <Button
                fullWidth
                isDisabled={isActionDisabled}
                isPending={isPending}
                onPress={onCheckMembership}
                variant="secondary"
              >
                بررسی عضویت
              </Button>

              <p className="text-muted text-center text-xs leading-6">
                دسترسی این حساب به گروه هدف دوباره بررسی می‌شود.
              </p>
            </div>

            <div className="border-separator grid gap-3 border-t pt-5" hidden>
              <div>
                <p className="text-foreground text-sm font-semibold">
                  قطع اتصال
                </p>
                <p className="text-muted mt-1 text-xs leading-6">
                  دریافت مظنه از این حساب متوقف می‌شود.
                </p>
              </div>
              <ConfirmAction
                description="اتصال حساب تلگرام قطع می‌شود و دریافت مظنه از این حساب متوقف خواهد شد."
                isDisabled={isActionDisabled}
                label="قطع اتصال تلگرام"
                onConfirm={onRevoke}
                pending={isPending}
                title="اتصال تلگرام قطع شود؟"
              />
            </div>
          </Card.Footer>
        ) : null}
      </Card>
    </article>
  );
}
