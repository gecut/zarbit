import type { TelegramSessionStatus } from "@zarbit/contracts";

type ConnectionChip = {
  color: "danger" | "success" | "warning";
  label: string;
};

export type TelegramSessionPresentation = {
  canManageConnection: boolean;
  canStartLogin: boolean;
  chip: ConnectionChip;
  description: string;
  isUnavailable: boolean;
  showConnectionActions: boolean;
  title: string;
};

const stateLabels = {
  DISCONNECTED: "متصل نیست",
  PENDING_OTP: "در حال ورود",
  ACTIVE: "حساب متصل",
  NOT_IN_GROUP: "عضویت تأیید نشده",
  REVOKING: "در حال قطع اتصال",
  REVOKED: "اتصال قطع شده",
  ERROR: "نیازمند بررسی",
} as const;

function resolveChip(session: TelegramSessionStatus): ConnectionChip {
  if ("kind" in session) {
    switch (session.kind) {
      case "ACTIVE":
        return { color: "success", label: "دریافت مظنه فعال" };
      case "REVOKED":
        return { color: "danger", label: "اتصال قطع شده" };
      case "NOT_IN_GROUP":
        return { color: "danger", label: "عضویت تأیید نشده" };
      case "ERROR":
        return { color: "danger", label: "نیازمند بررسی" };
      case "LOGIN_PENDING":
      case "REVOKING":
      case "DEGRADED":
        return {
          color: "warning",
          label:
            session.kind === "DEGRADED" ? "اتصال ناپایدار" : "در حال پردازش",
        };
      case "DISCONNECTED":
        return { color: "warning", label: "متصل نیست" };
    }
  }
  const state = session.state;
  if (session.state === "NOT_IN_GROUP" || session.state === "ERROR") {
    return {
      color: "danger",
      label: stateLabels[state as keyof typeof stateLabels] ?? "نیازمند بررسی",
    };
  }

  if (
    session.state === "PENDING_OTP" ||
    session.state === "REVOKING" ||
    session.connection === "CONNECTING"
  ) {
    return {
      color: "warning",
      label: stateLabels[state as keyof typeof stateLabels] ?? "در حال ورود",
    };
  }

  if (session.state === "ACTIVE" && session.connection === "CONNECTED") {
    return { color: "success", label: "دریافت مظنه فعال" };
  }

  return { color: "warning", label: "دریافت مظنه غیرفعال" };
}

function resolveDescription(session: TelegramSessionStatus): string {
  if ("kind" in session) {
    switch (session.kind) {
      case "ACTIVE":
        return "این حساب برای دریافت مظنه از گروه هدف آماده است.";
      case "REVOKED":
        return "اتصال تلگرام توسط تلگرام قطع شده است؛ دوباره وارد شوید.";
      case "DEGRADED":
        return "ارتباط با تلگرام ناپایدار است؛ اتصال دوباره به‌صورت خودکار تلاش می‌شود.";
      case "NOT_IN_GROUP":
        return "این حساب باید عضو گروه هدف باشد تا مظنه دریافت شود.";
      case "LOGIN_PENDING":
        return "مراحل ورود تلگرام را کامل کنید.";
      case "REVOKING":
        return "اتصال حساب در حال قطع شدن است.";
      case "ERROR":
        return "اتصال با خطا روبه‌رو شده است؛ دوباره تلاش کنید.";
      case "DISCONNECTED":
        return "برای استفاده، حساب تلگرام را متصل کنید.";
    }
  }
  if (session.state === "ACTIVE" && session.connection === "CONNECTED") {
    return "این حساب برای دریافت مظنه از گروه هدف آماده است.";
  }

  if (session.state === "NOT_IN_GROUP") {
    return "این حساب باید عضو گروه هدف باشد تا مظنه دریافت شود.";
  }

  if (session.state === "REVOKING") {
    return "اتصال حساب در حال قطع شدن است.";
  }

  return "این اتصال برای دریافت مظنه گروه استفاده می‌شود.";
}

export function resolveTelegramSessionPresentation(
  session: TelegramSessionStatus,
): TelegramSessionPresentation {
  const showConnectionActions =
    "kind" in session
      ? session.kind === "ACTIVE" ||
        session.kind === "NOT_IN_GROUP" ||
        session.kind === "DEGRADED"
      : session.state === "ACTIVE" || session.state === "NOT_IN_GROUP";
  const isUnavailable =
    session.connection === "OFFLINE" || session.connection === "DEGRADED";

  return {
    canManageConnection:
      "kind" in session
        ? (session.capabilities?.canRevoke ?? false)
        : showConnectionActions && session.connection === "CONNECTED",
    canStartLogin:
      "kind" in session
        ? (session.capabilities?.canLogin ?? false)
        : !session.login &&
          !isUnavailable &&
          (session.state === "DISCONNECTED" ||
            session.state === "REVOKED" ||
            session.state === "ERROR"),
    chip: resolveChip(session),
    description: resolveDescription(session),
    isUnavailable,
    showConnectionActions,
    title: (
      "kind" in session ? session.kind === "ACTIVE" : session.state === "ACTIVE"
    )
      ? "تلگرام متصل است"
      : "اتصال حساب تلگرام",
  };
}
