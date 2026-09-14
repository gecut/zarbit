import type { TelegramSessionStatus } from "@zarbit/contracts";
export type TelegramSessionPresentation = {
  canManageConnection: boolean;
  canStartLogin: boolean;
  chip: { color: "danger" | "success" | "warning"; label: string };
  description: string;
  isUnavailable: boolean;
  showConnectionActions: boolean;
  title: string;
};
export function resolveTelegramSessionPresentation(
  session: TelegramSessionStatus,
): TelegramSessionPresentation {
  const ready =
    session.worker === "AVAILABLE" &&
    session.authorization === "AUTHORIZED" &&
    session.connection === "CONNECTED" &&
    session.membership === "MEMBER";
  let description = "برای استفاده، حساب تلگرام را متصل کنید.";
  let chip: TelegramSessionPresentation["chip"] = {
    color: "warning",
    label: "متصل نیست",
  };
  if (session.authorization === "REVOKING") {
    description =
      "درخواست توقف ثبت شده است؛ پایان قطع اتصال در حال پیگیری است.";
    chip = { color: "warning", label: "در حال قطع اتصال" };
  } else if (session.authorization === "LOGIN_PENDING") {
    description = "مراحل ورود همین حساب تلگرام را کامل کنید.";
    chip = { color: "warning", label: "در حال ورود" };
  } else if (ready) {
    description = "این حساب برای دریافت مظنه از گروه هدف آماده است.";
    chip = { color: "success", label: "دریافت مظنه فعال" };
  } else if (session.authorization === "AUTHORIZED") {
    if (session.membership === "NOT_MEMBER") {
      description = "ابتدا عضو گروه هدف شوید، سپس بررسی عضویت را بزنید.";
      chip = { color: "danger", label: "عضویت تأیید نشده" };
    } else {
      description = "حساب وارد شده است؛ آماده‌شدن اتصال در حال پیگیری است.";
      chip = { color: "warning", label: "اتصال آماده نیست" };
    }
  } else if (session.authorization === "REVOKED") {
    description = "اتصال پایان یافته است؛ برای اتصال دوباره وارد شوید.";
    chip = { color: "warning", label: "اتصال قطع شده" };
  } else if (session.authorization === "ERROR") {
    description = "ورود کامل نشده است؛ دوباره تلاش کنید.";
    chip = { color: "danger", label: "ورود کامل نشده" };
  }
  if (session.worker === "UNAVAILABLE" && session.authorization !== "REVOKING")
    chip = { color: "warning", label: "وضعیت ذخیره‌شده" };
  return {
    chip,
    description,
    title: ready ? "تلگرام متصل است" : "اتصال حساب تلگرام",
    isUnavailable: session.worker === "UNAVAILABLE",
    canStartLogin: session.capabilities.canLogin,
    canManageConnection: session.capabilities.canRevoke,
    showConnectionActions:
      session.authorization === "AUTHORIZED" || session.capabilities.canRevoke,
  };
}
