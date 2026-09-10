import { bold, escapeMarkdown } from "./format";

export function formatWelcomeMessage(input: { configured: boolean }): string {
  return [
    bold("به زربیت خوش آمدید"),
    escapeMarkdown(
      input.configured
        ? "هشدار مظنه و درخواست‌های خریدوفروش خود را در زربیت مدیریت کنید."
        : "لینک برنامه هنوز تنظیم نشده است؛ کمی بعد دوباره تلاش کنید.",
    ),
  ].join("\n");
}
