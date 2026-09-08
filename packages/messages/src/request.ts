import type { RequestDetail } from "@zarbit/contracts";
import { bold, escapeMarkdown, formatNumber, formatPrice, formatTime, inlineCode } from "./format";

export type RequestMessageInput = Pick<RequestDetail, "action" | "condition" | "targetPrice" | "units">;
export type RequestFailure = "connection" | "group_permission" | "private_permission" | "unknown";
export type RequestTrigger = { compactQuote: number; announcedAt: Date };

const labels = { BUY: "خرید", SELL: "فروش", ALERT: "هشدار" } as const;

export function formatAlertMessage(input: RequestMessageInput & { trigger?: RequestTrigger }): string {
  return [
    bold(input.trigger ? "🔔 شرط هشدار شما برقرار شد" : "🔔 هشدار شما به‌صورت دستی اجرا شد"),
    ...(input.trigger ? [`مظنه دریافتی: ${bold(formatPrice(input.trigger.compactQuote))}`] : []),
    `شرط شما: ${escapeMarkdown(input.condition === "GTE" ? "برابر یا بیشتر از" : "برابر یا کمتر از")} ${escapeMarkdown(formatPrice(input.targetPrice))}`,
    input.trigger ? `زمان مظنه: ${formatTime(input.trigger.announcedAt)}` : "اجرای دستی",
  ].join("\n");
}

export function requestFailureText(action: RequestMessageInput["action"], status: "FAILED" | "UNKNOWN", failure: RequestFailure = "unknown", recovered = false): string {
  if (status === "UNKNOWN") {
    return `${recovered ? "سرویس هنگام اجرا متوقف شد. " : "تأیید ارسال دریافت نشد. "}ممکن است پیام ارسال شده باشد؛ پیش از اقدام دوباره، ${action === "ALERT" ? "گفت‌وگوی بات" : "گروه"} را بررسی کنید.`;
  }
  switch (failure) {
    case "connection": return "اتصال تلگرام فعال نیست؛ اتصال خود را بررسی کنید.";
    case "group_permission": return "مجوز ارسال در گروه تأیید نشد؛ عضویت و دسترسی خود را بررسی کنید.";
    case "private_permission": return "تلگرام ارسال پیام خصوصی را نپذیرفت؛ دسترسی بات به گفت‌وگو را بررسی کنید.";
    case "unknown": return "ارسال انجام نشد؛ وضعیت درخواست و دسترسی تلگرام را بررسی کنید.";
  }
}

export function formatRequestResultMessage(input: RequestMessageInput & {
  status: "DONE" | "FAILED" | "UNKNOWN";
  failure?: RequestFailure;
  recovered?: boolean;
  groupText?: string;
  manual?: boolean;
}): string {
  const title = input.status === "DONE"
    ? `✅ پیام ${labels[input.action]} شما ارسال شد`
    : input.status === "FAILED" ? `❌ پیام ${labels[input.action]} ارسال نشد` : `⚠️ وضعیت ارسال ${labels[input.action]} مشخص نیست`;
  return [
    bold(title),
    escapeMarkdown(`${input.units === null ? "" : `تعداد: ${formatNumber(input.units)} · `}قیمت درخواست: ${formatPrice(input.targetPrice)}`),
    ...(input.status === "DONE" && input.groupText ? [`متن ارسال‌شده: ${inlineCode(input.groupText)}`] : []),
    ...(input.manual ? ["اجرای دستی"] : []),
    escapeMarkdown(input.status === "DONE"
      ? "ارسال پیام به معنی تأیید معامله نیست."
      : requestFailureText(input.action, input.status, input.failure, input.recovered)),
  ].join("\n");
}
