import { Bot, InlineKeyboard } from "grammy";

export function createTelegramBot(token: string, webAppUrl?: string) {
  const bot = new Bot(token);
  bot.command("start", async (ctx) => {
    if (!webAppUrl) return ctx.reply("لینک برنامه هنوز پیکربندی نشده است.");
    return ctx.reply("برای مدیریت درخواست‌های مظنه، زربیت را باز کنید.", {
      reply_markup: new InlineKeyboard().webApp("باز کردن زربیت", webAppUrl),
    });
  });
  return bot;
}

export async function sendPrivateNotification(token: string, telegramUserId: string, text: string) {
  const bot = new Bot(token);
  await bot.api.sendMessage(telegramUserId, text);
}
