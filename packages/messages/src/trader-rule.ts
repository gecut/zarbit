import {
  bold,
  escapeMarkdown,
  formatNumber,
  formatPrice,
  formatTime,
} from "./format";

export interface TraderRuleAlertInput {
  traderAlias: string;
  trigger: "ORDER_PLACED" | "TRADE_CONFIRMED";
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  announcedAt: Date;
}

export function formatTraderRuleAlertMessage(
  input: TraderRuleAlertInput,
): string {
  const triggerText =
    input.trigger === "ORDER_PLACED" ? "لفظ سفارش" : "معامله قطعی";
  const sideText = input.side === "BUY" ? "خرید" : "فروش";

  return [
    `🔔 ${bold(`${input.traderAlias}:`)} ${sideText} ${bold(formatNumber(input.quantity))} واحد با مظنه ${bold(formatPrice(input.price))}`,
    escapeMarkdown(`(${triggerText} · ${formatTime(input.announcedAt)})`),
  ].join("\n");
}
