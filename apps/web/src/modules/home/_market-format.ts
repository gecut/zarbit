import { compactQuoteToDisplayPrice } from "@zarbit/domain";

export const marketNumber = new Intl.NumberFormat("fa-IR");

const time = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeWithSeconds = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const fullToman = (compact: number) =>
  marketNumber.format(compactQuoteToDisplayPrice(compact)).replaceAll("٬", ".");

export const compactPriceFormat = (compact: number) =>
  marketNumber.format(compact);

export const marketTime = (value: string | number) =>
  time.format(new Date(value));

export const marketTimePrecise = (value: string | number) =>
  timeWithSeconds.format(new Date(value));

export function relativeTimeFromNow(
  isoDate: string | number,
  now = Date.now(),
): string {
  const diffMs = Math.max(0, now - new Date(isoDate).getTime());
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 20) return "همین حالا";
  if (diffSec < 60) return `${marketNumber.format(diffSec)} ثانیه پیش`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${marketNumber.format(diffMin)} دقیقه پیش`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${marketNumber.format(diffHours)} ساعت پیش`;
  return `${marketNumber.format(Math.floor(diffHours / 24))} روز پیش`;
}

export function marketDifference(value: number): string {
  if (value === 0) return "برابر با مظنه";
  return `${marketNumber.format(Math.abs(value))} هزار تومان ${value < 0 ? "زیر" : "بالای"} مظنه`;
}

export interface MarketDifferenceDetails {
  text: string;
  diffToman: string;
  direction: "up" | "down" | "flat";
  shortLabel: string;
  compact: number;
}

export function marketDifferenceDetails(
  value: number,
): MarketDifferenceDetails {
  const diffToman = Math.abs(value) * 1000;
  const formattedToman = marketNumber.format(diffToman).replaceAll("٬", ".");
  if (value === 0) {
    return {
      text: "برابر با مظنه",
      diffToman: "۰ تومان",
      direction: "flat",
      shortLabel: "تراز با مظنه",
      compact: 0,
    };
  }
  const direction = value > 0 ? "up" : "down";
  const label = value > 0 ? "بالای مظنه" : "زیر مظنه";
  return {
    text: `${marketNumber.format(Math.abs(value))} هزار تومان ${label}`,
    diffToman: `${value > 0 ? "+" : "-"}${formattedToman} تومان`,
    direction,
    shortLabel: `${value > 0 ? "+" : "-"}${marketNumber.format(Math.abs(value))} هزار`,
    compact: value,
  };
}
