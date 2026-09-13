import { compactQuoteToDisplayPrice } from "@zarbit/domain";

export const marketNumber = new Intl.NumberFormat("fa-IR");
const time = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export const fullToman = (compact: number) =>
  marketNumber.format(compactQuoteToDisplayPrice(compact));
export const marketTime = (value: string | number) =>
  time.format(new Date(value));
export function marketDifference(value: number): string {
  if (value === 0) return "برابر با مظنه";
  return `${marketNumber.format(Math.abs(value))} هزار تومان ${value < 0 ? "زیر" : "بالای"} مظنه`;
}
