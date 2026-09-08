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
  if (session.state === "NOT_IN_GROUP" || session.state === "ERROR") {
    return { color: "danger", label: stateLabels[session.state] };
  }

  if (
    session.state === "PENDING_OTP" ||
    session.state === "REVOKING" ||
    session.connection === "CONNECTING"
  ) {
    return { color: "warning", label: stateLabels[session.state] };
  }

  if (session.connection === "CONNECTED") {
    return { color: "success", label: "دریافت مظنه فعال" };
  }

  return { color: "warning", label: "دریافت مظنه غیرفعال" };
}

function resolveDescription(session: TelegramSessionStatus): string {
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
    session.state === "ACTIVE" || session.state === "NOT_IN_GROUP";
  const isUnavailable = session.connection === "OFFLINE";

  return {
    canManageConnection:
      showConnectionActions && session.connection === "CONNECTED",
    canStartLogin:
      !session.login &&
      !isUnavailable &&
      (session.state === "DISCONNECTED" ||
        session.state === "REVOKED" ||
        session.state === "ERROR"),
    chip: resolveChip(session),
    description: resolveDescription(session),
    isUnavailable,
    showConnectionActions,
    title: session.state === "ACTIVE" ? "تلگرام متصل است" : "اتصال حساب تلگرام",
  };
}
