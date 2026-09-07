import { Button, Card, Chip } from "@heroui/react";
import type { TelegramSessionStatus } from "@zarbit/contracts";
import type { ReactNode } from "react";

import { ConfirmAction } from "../confirm-action";
import type { SessionCommand } from "./telegram-types";

const states = {
  DISCONNECTED: "متصل نیست",
  PENDING_OTP: "در حال ورود",
  ACTIVE: "حساب متصل",
  NOT_IN_GROUP: "عضویت تأیید نشده",
  REVOKING: "در حال قطع اتصال",
  REVOKED: "اتصال قطع شده",
  ERROR: "نیازمند بررسی",
} as const;

type TelegramConnectionCardProps = {
  children: ReactNode;
  error: string | null | undefined;
  isLoading: boolean;
  isPending: boolean;
  loadError: string | undefined;
  onRetry: () => void;
  onRun: (command: SessionCommand) => Promise<unknown>;
  session: TelegramSessionStatus | undefined;
};

export function TelegramConnectionCard({
  children,
  error,
  isLoading,
  isPending,
  loadError,
  onRetry,
  onRun,
  session,
}: TelegramConnectionCardProps) {
  return (
    <article>
      <Card className="border-border bg-surface shadow-surface overflow-hidden rounded-[var(--radius-2xl)] border p-[1.15rem] sm:p-[1.45rem]">
        <header className="flex items-start gap-3">
          <div>
            <h1 className="text-foreground m-0 text-lg font-semibold">
              اتصال حساب تلگرام
            </h1>
            <p className="text-muted mt-[0.2rem] text-xs leading-7">
              این اتصال برای دریافت مظنه گروه استفاده می‌شود. کد و رمز دوم فقط
              برای ورود استفاده می‌شوند و ذخیره نمی‌شوند.
            </p>
          </div>
        </header>
        {isLoading ? <p role="status">در حال دریافت وضعیت…</p> : null}
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <Button onPress={onRetry}>تلاش دوباره</Button>
          </>
        ) : null}
        {session ? (
          <>
            <div className="bg-default mt-5 flex items-center justify-between gap-4 rounded-[var(--radius-2xl)] px-[0.9rem] py-[0.8rem]">
              <span>{states[session.state]}</span>
              <Chip
                color={
                  session.connection === "CONNECTED" ? "success" : "warning"
                }
                size="sm"
                variant="soft"
              >
                {session.connection === "CONNECTED"
                  ? "متصل و آماده دریافت مظنه"
                  : session.connection === "CONNECTING"
                    ? "در حال اتصال…"
                    : "دریافت مظنه غیرفعال"}
              </Chip>
            </div>
            {session.connectedTelegramUserId ? (
              <p className="text-muted mt-1 text-xs leading-6">
                شناسه حساب: <bdi>{session.connectedTelegramUserId}</bdi>
              </p>
            ) : null}
            {session.membershipCheckedAt ? (
              <p className="text-muted mt-1 text-xs leading-6">
                آخرین بررسی عضویت:{" "}
                {new Date(session.membershipCheckedAt).toLocaleString("fa-IR")}
              </p>
            ) : null}
            {session.error ? (
              <p
                className="text-danger-soft-foreground mt-[0.9rem] flex items-start gap-2 text-xs leading-7"
                role="status"
              >
                {session.error}
              </p>
            ) : null}
            {children}
            {["ACTIVE", "NOT_IN_GROUP", "REVOKING"].includes(session.state) ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-[0.55rem]">
                <Button
                  isDisabled={isPending || session.state === "REVOKING"}
                  onPress={() =>
                    void onRun({ type: "membership" }).catch(() => undefined)
                  }
                  variant="secondary"
                >
                  بررسی دوباره عضویت
                </Button>
                <ConfirmAction
                  description="اتصال حساب تلگرام قطع می‌شود و دریافت مظنه از این حساب متوقف خواهد شد."
                  label="قطع اتصال"
                  onConfirm={() => onRun({ type: "revoke" })}
                  pending={isPending}
                  title="اتصال تلگرام قطع شود؟"
                />
              </div>
            ) : null}
          </>
        ) : null}
        {error ? (
          <p
            className="text-danger-soft-foreground -mt-1 flex items-start gap-2 text-xs leading-7"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <p className="text-muted mt-1 text-xs leading-6">
          کد ورود را در چت بات نفرستید. محل دریافت کد را تلگرام تعیین می‌کند؛
          پیامک تضمین‌شده نیست.
        </p>
      </Card>
    </article>
  );
}
