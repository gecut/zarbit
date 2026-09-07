import type { Store } from "@zarbit/db";
import { parseQuoteMessage } from "@zarbit/domain";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";

export function createQuoteRecorder(
  store: Pick<Store, "recordLatestQuote">,
  config: { groupId: number; senderId: string },
) {
  return async (userId: string, _revision: number, event: QuoteEvent) => {
    if (event.chatId !== config.groupId || event.senderId !== config.senderId) {
      workerLog.debug("telegram.quote.ignored", {
        reason: "unexpected_source",
        sessionRef: sessionRef(userId),
      });
      return;
    }

    const compactQuote = parseQuoteMessage(event.text);
    if (!compactQuote) {
      workerLog.debug("telegram.quote.ignored", {
        messageId: event.messageId,
        reason: "unrecognized_format",
        sessionRef: sessionRef(userId),
      });
      return;
    }

    const recorded = await store.recordLatestQuote({
      compactQuote,
      announcedAt: event.date,
      receivedAt: new Date(),
      sourceMessageId: event.messageId,
    });
    workerLog.info("telegram.quote.recorded", {
      compactQuote,
      messageId: event.messageId,
      recorded,
      sessionRef: sessionRef(userId),
    });
  };
}
