import { bold, escapeMarkdown, formatPrice, formatTime } from "./format";

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
    input.trigger === "ORDER_PLACED"
      ? "لفظ جدید ثبت شد"
      : "معامله قطعی حواله شد";
  const sideText = input.side === "BUY" ? "خرید" : "فروش";

  return [
    bold(`🔔 هشدار معامله‌گر: ${input.traderAlias}`),
    `رویداد: ${escapeMarkdown(triggerText)}`,
    `جهت: ${bold(sideText)}`,
    `حجم: ${bold(input.quantity.toString())} واحد`,
    `قیمت: ${bold(formatPrice(input.price))}`,
    `زمان: ${formatTime(input.announcedAt)}`,
  ].join("\n");
}
