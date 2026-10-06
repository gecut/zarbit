import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Chip } from "@heroui/react";
import {
  ChatRoundDotsIcon,
  DangerTriangleIcon,
  LockKeyholeMinimalisticIcon,
  RestartIcon,
  ShieldCrossIcon,
  WiFiOffIcon,
} from "@solar-icons/react/linear";
import { AppError, type Identity } from "@zarbit/contracts";
import { useApi } from "../api/api-context";
import { telegramInitData } from "../telegram/telegram";
import { authErrorMessage } from "./auth-error-message";

const IdentityContext = createContext<Identity | null>(null);

export function useIdentity() {
  const user = useContext(IdentityContext);
  if (!user) throw new Error("Authentication boundary is missing");
  return user;
}

function resolveAuthPresentation(error: unknown) {
  if (error instanceof AppError) {
    if (error.status === 401) {
      return {
        badgeLabel: "نیاز به احراز هویت",
        badgeColor: "warning" as const,
        Icon: LockKeyholeMinimalisticIcon,
        iconColorClass: "text-warning",
        glowColorClass: "bg-warning/15",
      };
    }
    if (error.status === 403) {
      return {
        badgeLabel: "عدم دسترسی حساب",
        badgeColor: "danger" as const,
        Icon: ShieldCrossIcon,
        iconColorClass: "text-danger",
        glowColorClass: "bg-danger/15",
      };
    }
    if (error.code === "NETWORK") {
      return {
        badgeLabel: "عدم برقراری ارتباط",
        badgeColor: "warning" as const,
        Icon: WiFiOffIcon,
        iconColorClass: "text-warning",
        glowColorClass: "bg-warning/15",
      };
    }
    if (error.status >= 500) {
      return {
        badgeLabel: "اختلال در سرویس",
        badgeColor: "danger" as const,
        Icon: DangerTriangleIcon,
        iconColorClass: "text-danger",
        glowColorClass: "bg-danger/15",
      };
    }
    if (error.status === 429) {
      return {
        badgeLabel: "محدودیت موقت تلاش",
        badgeColor: "warning" as const,
        Icon: DangerTriangleIcon,
        iconColorClass: "text-warning",
        glowColorClass: "bg-warning/15",
      };
    }
  }

  return {
    badgeLabel: "خطای دسترسی به سامانه",
    badgeColor: "danger" as const,
    Icon: DangerTriangleIcon,
    iconColorClass: "text-danger",
    glowColorClass: "bg-danger/15",
  };
}

export function AuthGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const query = useQuery(api.auth.identity.queryOptions({ retry: false }));
  const unauthorized =
    query.error instanceof AppError && [401, 403].includes(query.error.status);
  const isOutsideTelegram = !telegramInitData();

  if (query.isPending) {
    const isPaused = query.fetchStatus === "paused";
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div
          role="status"
          aria-live="polite"
          className="card card--default border-border/80 bg-surface/95 shadow-surface relative w-full overflow-hidden text-center backdrop-blur-xl transition-all"
        >
          <div className="relative mx-auto mb-4 flex size-14 items-center justify-center sm:size-16">
            <div
              aria-hidden="true"
              className="bg-accent/15 absolute inset-0 animate-pulse rounded-3xl blur-md"
            />
            <div className="border-border bg-surface-secondary/80 text-foreground shadow-xs relative flex size-14 items-center justify-center rounded-3xl border sm:size-16">
              {isPaused ? (
                <WiFiOffIcon className="text-warning size-7 stroke-[1.8]" />
              ) : (
                <div className="border-accent size-6 animate-spin rounded-full border-2 border-t-transparent" />
              )}
            </div>
          </div>

          <div className="mb-2 flex justify-center">
            <Chip
              size="sm"
              color={isPaused ? "warning" : "default"}
              variant="soft"
            >
              <Chip.Label>
                {isPaused ? "اتصال موقتاً قطع است" : "بررسی دسترسی"}
              </Chip.Label>
            </Chip>
          </div>

          <p className="text-muted mt-2 text-pretty text-sm leading-relaxed">
            {isPaused
              ? "اتصال اینترنت قطع است؛ پس از اتصال، دسترسی دوباره بررسی می‌شود."
              : "در حال بررسی دسترسی…"}
          </p>
        </div>
      </div>
    );
  }

  if (query.error || !query.data) {
    const {
      badgeLabel,
      badgeColor,
      Icon: StatusIcon,
      iconColorClass,
      glowColorClass,
    } = resolveAuthPresentation(query.error);

    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center px-4 py-8 sm:py-12">
        <section
          role="alert"
          aria-live="assertive"
          className="card card--default border-border/80 bg-surface/95 shadow-surface relative w-full overflow-hidden text-center backdrop-blur-xl transition-all"
        >
          {/* Subtle warm glow at top */}
          <div
            aria-hidden="true"
            className="bg-accent/10 dark:bg-accent/5 pointer-events-none absolute inset-x-0 -top-10 mx-auto h-20 w-32 rounded-full blur-2xl"
          />

          {/* Status Icon */}
          <div className="relative mx-auto mb-4 flex size-14 items-center justify-center sm:size-16">
            <div
              aria-hidden="true"
              className={`absolute inset-0 rounded-3xl blur-md ${glowColorClass}`}
            />
            <div className="border-border bg-surface-secondary/80 shadow-xs relative flex size-14 items-center justify-center rounded-3xl border sm:size-16">
              <StatusIcon className={`size-7 stroke-[1.8] ${iconColorClass}`} />
            </div>
          </div>

          {/* Status Badge */}
          <div className="mb-3 flex justify-center">
            <Chip size="sm" color={badgeColor} variant="soft">
              <Chip.Label>{badgeLabel}</Chip.Label>
            </Chip>
          </div>

          {/* Title */}
          <h1 className="text-foreground text-lg font-bold tracking-tight sm:text-xl">
            ورود به زربیت
          </h1>

          {/* Error Message */}
          <p className="text-muted mt-2 text-pretty text-sm leading-relaxed">
            {authErrorMessage(query.error)}
          </p>

          {/* Telegram Guidance Box */}
          {isOutsideTelegram ? (
            <div className="border-border/70 bg-surface-secondary/60 mt-5 rounded-2xl border p-3.5 text-right">
              <div className="flex items-center gap-3">
                <span className="bg-accent/15 text-accent grid size-8 shrink-0 place-items-center rounded-xl">
                  <ChatRoundDotsIcon className="size-4.5" />
                </span>
                <p className="text-foreground/90 text-xs font-medium leading-5">
                  برنامه را از بات زربیت در تلگرام باز کنید.
                </p>
              </div>
            </div>
          ) : null}

          {/* Retry Action */}
          {!unauthorized ? (
            <div className="mt-6">
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onPress={() => {
                  void query.refetch();
                }}
                isDisabled={query.isFetching}
              >
                <RestartIcon
                  className={`size-4.5 shrink-0 ${query.isFetching ? "animate-spin" : ""}`}
                />
                <span>تلاش دوباره</span>
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return <IdentityContext value={query.data}>{children}</IdentityContext>;
}
