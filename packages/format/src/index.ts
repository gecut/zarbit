import { compactQuoteToDisplayPrice } from "@zarbit/domain";

const locale = "fa-IR-u-ca-persian-nu-arabext";
const timeZone = "Asia/Tehran";
const invalidDatePlaceholder = "—";

const numberFormatter = new Intl.NumberFormat(locale, {
  useGrouping: true,
});

const dateFormatter = new Intl.DateTimeFormat(locale, {
  timeZone,
  calendar: "persian",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat(locale, {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const shortTimeFormatter = new Intl.DateTimeFormat(locale, {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type DateInput = Date | number | string;

function toValidDate(value: DateInput): Date | undefined {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatCompactPrice(compactPrice: number): string {
  return formatNumber(compactPrice);
}

export function formatTomanFromCompactPrice(compactPrice: number): string {
  return formatNumber(compactQuoteToDisplayPrice(compactPrice));
}

export function formatTime(value: DateInput): string {
  const date = toValidDate(value);
  return date ? timeFormatter.format(date) : invalidDatePlaceholder;
}

export function formatDateTime(value: DateInput): string {
  const date = toValidDate(value);
  return date
    ? `${dateFormatter.format(date)}، ${shortTimeFormatter.format(date)}`
    : invalidDatePlaceholder;
}

export function formatRelativeDateTime(
  value: DateInput,
  now: DateInput = Date.now(),
): string {
  const date = toValidDate(value);
  const current = toValidDate(now);
  if (!date || !current) return invalidDatePlaceholder;

  const elapsedSeconds = Math.floor(
    Math.max(0, current.getTime() - date.getTime()) / 1_000,
  );
  if (elapsedSeconds < 20) return "همین حالا";
  if (elapsedSeconds < 60) return `${formatNumber(elapsedSeconds)} ثانیه پیش`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${formatNumber(elapsedMinutes)} دقیقه پیش`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${formatNumber(elapsedHours)} ساعت پیش`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${formatNumber(elapsedDays)} روز پیش، ساعت ${shortTimeFormatter.format(
    date,
  )}`;
}
