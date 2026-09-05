import type { Store } from "@zarbit/db";
import { uncertainMessage } from "@zarbit/db";
import {
  buildAlertMessage,
  buildTradeFailureMessage,
  buildTradeMessage,
  buildTradeSuccessMessage,
  parseQuoteMessage,
} from "@zarbit/domain";
import type { QuoteEvent } from "./transport";

export interface ExecutionConnection {
  checkForExecution(userId: string, revision: number): Promise<boolean>;
  sendReply(userId: string, messageId: number, text: string): Promise<number>;
}
export function createExecutor(
  store: Store,
  sessions: ExecutionConnection,
  config: {
    groupId: number;
    senderId: string;
    notify: (telegramUserId: string, text: string) => Promise<void>;
  },
) {
  return async (userId: string, revision: number, event: QuoteEvent) => {
    if (event.chatId !== config.groupId || event.senderId !== config.senderId)
      return;
    const quote = parseQuoteMessage(event.text);
    if (!quote) return;
    const candidates = await store.candidates(userId, quote, event.date);
    for (const candidate of candidates) {
      if (!(await sessions.checkForExecution(userId, revision))) return;
      const request = await store.claim(
        userId,
        candidate.id,
        quote,
        event.date,
        revision,
      );
      if (!request?.claimToken) continue;
      let outgoingMessageId: number | undefined;
      try {
        if (request.action === "ALERT")
          await config.notify(
            request.user.telegramUserId,
            buildAlertMessage({ quote, targetPrice: request.targetPrice }),
          );
        else
          outgoingMessageId = await sessions.sendReply(
            userId,
            event.messageId,
            buildTradeMessage({
              action: request.action,
              units: request.units!,
              quote,
            }),
          );
      } catch {
        await store.finish(
          request.id,
          request.claimToken,
          quote,
          event.messageId,
          {
            error:
              request.action === "ALERT"
                ? "ارسال هشدار انجام نشد؛ دسترسی ارسال پیام بات را بررسی کنید."
                : uncertainMessage,
          },
        );
        if (request.action !== "ALERT")
          await config
            .notify(request.user.telegramUserId, buildTradeFailureMessage())
            .catch(() =>
              console.warn("telegram.notification.failed", {
                requestId: request.id,
              }),
            );
        continue;
      }
      // If persistence fails after Telegram accepted a send, keep the claim. Never resend.
      await store.finish(
        request.id,
        request.claimToken,
        quote,
        event.messageId,
        { outgoingMessageId },
      );
      if (request.action !== "ALERT")
        await config
          .notify(
            request.user.telegramUserId,
            buildTradeSuccessMessage({
              action: request.action,
              units: request.units!,
              quote,
            }),
          )
          .catch(() =>
            console.warn("telegram.notification.failed", {
              requestId: request.id,
            }),
          );
    }
  };
}
