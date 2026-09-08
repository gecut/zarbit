import type { Bot } from "grammy";
import type { Store } from "@zarbit/db";
import { buildMessageButtons, formatRequestResultMessage, TELEGRAM_PARSE_MODE, type MessageLinks } from "@zarbit/messages";
import { sessionRef, workerLog } from "./logger";

export function createPrivateNotifier(bot: Bot, config: { webAppUrl?: string; groupId: number }) {
  if (!config.webAppUrl) workerLog.warn("telegram.notification.buttons_unconfigured");
  return async (id: string, text: string, links: MessageLinks = {}): Promise<number> => {
    const startedAt = Date.now();
    try {
      const message = await bot.api.sendMessage(id, text, {
        parse_mode: TELEGRAM_PARSE_MODE,
        link_preview_options: { is_disabled: true },
        reply_markup: buildMessageButtons({ ...config, ...links }),
      });
      workerLog.info("telegram.private_message.completed", { durationMs: Date.now() - startedAt, sessionRef: sessionRef(id) });
      return message.message_id;
    } catch (error) {
      workerLog.failure("telegram.private_message.failed", error, { durationMs: Date.now() - startedAt, sessionRef: sessionRef(id) });
      throw error;
    }
  };
}

export async function notifyRecoveredRequests(
  rows: Awaited<ReturnType<Store["recoverRequests"]>>,
  owner: Store["owner"],
  notify: ReturnType<typeof createPrivateNotifier>,
): Promise<void> {
  for (const row of rows) {
    try {
      const user = await owner(row.userId);
      if (!user) continue;
      await notify(user.telegramUserId, formatRequestResultMessage({ ...row, status: "UNKNOWN", recovered: true }), { requestId: row.id });
    } catch (error) {
      workerLog.failure("request.recovery_notification.failed", error, { requestId: row.id });
    }
  }
}
