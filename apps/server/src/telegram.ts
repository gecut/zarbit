import { Bot } from "grammy";
import { buildMessageButtons, formatWelcomeMessage, TELEGRAM_PARSE_MODE } from "@zarbit/messages";

export function createTelegramBot(token: string, webAppUrl?: string) {
  const bot = new Bot(token);
  bot.command("start", (ctx) => ctx.reply(formatWelcomeMessage({ configured: !!webAppUrl }), {
    parse_mode: TELEGRAM_PARSE_MODE,
    link_preview_options: { is_disabled: true },
    reply_markup: buildMessageButtons({ webAppUrl, privateChat: ctx.chat.type === "private" }),
  }));
  return bot;
}
