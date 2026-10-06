import {
  BellRingIcon,
  CourseDownIcon,
  CourseUpIcon,
  ExportIcon,
  ImportIcon,
} from "@solar-icons/react/linear";
import { formatDateTime } from "@zarbit/format";

const labels = {
  ACTIVE: "فعال",
  DONE: "ارسال شد",
  CANCELLED: "لغو شد",
  FAILED: "ناموفق",
  UNKNOWN: "نامشخص",
} as const;
export const executionPhaseLabels = {
  WAITING_TRADE: "در انتظار معاملهٔ تازه",
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

export const priceModeLabels = {
  TARGET_PRICE: "مظنه تعیین‌شده",
  LAST_TRADE: "مظنه آخرین معامله",
} as const;

export const priceModeDescriptions = {
  TARGET_PRICE: "ارسال با قیمت هدف تعیین‌شده شما",
  LAST_TRADE: "ارسال با مظنه معامله‌ای که شرط را فعال کرد",
} as const;

export function userMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "عملیات انجام نشد؛ دوباره تلاش کنید.";
}

export { formatNumber } from "@zarbit/format";

export function formatDate(value: string | null): string {
  return value ? formatDateTime(value) : "—";
}

export function requestStatusLabel(status: keyof typeof labels): string {
  return labels[status];
}
