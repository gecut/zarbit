import {
  BellRingIcon,
  CourseDownIcon,
  CourseUpIcon,
  ExportIcon,
  ImportIcon,
} from "@solar-icons/react/linear";

const labels = {
  ACTIVE: "فعال",
  DONE: "ارسال شد",
  CANCELLED: "لغو شد",
  FAILED: "ناموفق",
  UNKNOWN: "نامشخص",
} as const;
export const executionPhaseLabels = {
  WAITING_QUOTE: "در انتظار مظنه",
  CLAIMED: "در صف اجرا",
  SENDING: "در حال ارسال",
  DONE: "ارسال شد",
  FAILED: "ناموفق",
  CANCELLED: "لغو شد",
  UNKNOWN: "نتیجه نامشخص؛ گروه را بررسی کنید",
} as const;

export const actionLabels = {
  ALERT: "هشدار",
  BUY: "خرید",
  SELL: "فروش",
} as const;

export const actionIcons = {
  ALERT: BellRingIcon,
  BUY: ImportIcon,
  SELL: ExportIcon,
} as const;

export const conditionLabels = {
  LTE: "کمتر یا مساوی قیمت هدف",
  GTE: "بیشتر یا مساوی قیمت هدف",
} as const;

export const conditionShortLabels = {
  LTE: "کمتر",
  GTE: "بیشتر",
} as const;

export const conditionOptions = [
  { value: "LTE", label: conditionLabels.LTE, Icon: CourseDownIcon },
  { value: "GTE", label: conditionLabels.GTE, Icon: CourseUpIcon },
] as const;

const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

export function userMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "عملیات انجام نشد؛ دوباره تلاش کنید.";
}

export function formatNumber(value: number): string {
  return value.toLocaleString("fa-IR").replaceAll("٬", ".");
}

export function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

export function requestStatusLabel(status: keyof typeof labels): string {
  return labels[status];
}
