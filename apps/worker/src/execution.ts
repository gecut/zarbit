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
import { sessionRef, workerLog } from "./logger";

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
    if (event.chatId !== config.groupId || event.senderId !== config.senderId) {
      workerLog.debug("telegram.quote.ignored", {
        reason: "unexpected_source",
        sessionRef: sessionRef(userId),
      });
      return;
    }
    const quote = parseQuoteMessage(event.text);
    if (!quote) {
      workerLog.debug("telegram.quote.ignored", {
        messageId: event.messageId,
        reason: "unrecognized_format",
        sessionRef: sessionRef(userId),
      });
      return;
    }
    workerLog.info("telegram.quote.received", {
      messageId: event.messageId,
      sessionRef: sessionRef(userId),
    });
    const candidates = await store.candidates(userId, quote, event.date);
    workerLog.info("telegram.quote.candidates_loaded", {
      candidateCount: candidates.length,
      messageId: event.messageId,
      sessionRef: sessionRef(userId),
    });
    for (const candidate of candidates) {
      if (!(await sessions.checkForExecution(userId, revision))) {
        workerLog.warn("telegram.quote.processing_stopped", {
          reason: "session_not_ready",
          sessionRef: sessionRef(userId),
        });
        return;
      }
      const request = await store.claim(
        userId,
        candidate.id,
        quote,
        event.date,
        revision,
      );
      if (!request?.claimToken) {
        workerLog.debug("telegram.quote.claim_skipped", {
          candidateId: candidate.id,
          sessionRef: sessionRef(userId),
        });
        continue;
      }
      workerLog.info("telegram.quote.claimed", {
        action: request.action,
        requestId: request.id,
        sessionRef: sessionRef(userId),
      });
      let outgoingMessageId: number | undefined;
      const deliveryStartedAt = Date.now();
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
        workerLog.info("telegram.notification.completed", {
          kind: request.action === "ALERT" ? "alert" : "trade_reply",
          requestId: request.id,
          sessionRef: sessionRef(userId),
        });
      } catch (error) {
        workerLog.failure("telegram.request.delivery_failed", error, {
          action: request.action,
          durationMs: Date.now() - deliveryStartedAt,
          requestId: request.id,
          sessionRef: sessionRef(userId),
        });
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
            .catch((error) =>
              workerLog.failure("telegram.notification.failed", error, {
                requestId: request.id,
                sessionRef: sessionRef(userId),
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
      workerLog.info("telegram.request.delivery_completed", {
        action: request.action,
        durationMs: Date.now() - deliveryStartedAt,
        requestId: request.id,
        sessionRef: sessionRef(userId),
      });
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
          .then(() =>
            workerLog.info("telegram.notification.completed", {
              kind: "trade_success",
              requestId: request.id,
              sessionRef: sessionRef(userId),
            }),
          )
          .catch((error) =>
            workerLog.failure("telegram.notification.failed", error, {
              requestId: request.id,
              sessionRef: sessionRef(userId),
            }),
          );
    }
  };
}
