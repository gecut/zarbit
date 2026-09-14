import { formatNumber } from "@zarbit/format";

export function marketDifference(value: number): string {
  if (value === 0) return "برابر با مظنه";
  return `${formatNumber(Math.abs(value))} هزار تومان ${value < 0 ? "زیر" : "بالای"} مظنه`;
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
  const formattedToman = formatNumber(diffToman);
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
    text: `${formatNumber(Math.abs(value))} هزار تومان ${label}`,
    diffToman: `${value > 0 ? "+" : "-"}${formattedToman} تومان`,
    direction,
    shortLabel: `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))} هزار`,
    compact: value,
  };
}
