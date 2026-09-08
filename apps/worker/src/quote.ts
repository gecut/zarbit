import type { Store } from "@zarbit/db";
import { isFreshQuote, parseQuoteMessage } from "@zarbit/domain";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";

export function createQuoteRecorder(
  store: Pick<Store, "recordQuote">,
  config: { groupId: number; senderId: string },
  match?: (quote: {
    compactQuote: number;
    sourceMessageId: number;
    announcedAt: Date;
  }) => Promise<void>,
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

    const receivedAt = new Date();
    const recorded = await store.recordQuote({
      compactQuote,
      announcedAt: event.date,
      receivedAt,
      sourceMessageId: event.messageId,
    });
    workerLog.info("telegram.quote.recorded", {
      compactQuote,
      historyRecorded: recorded.historyRecorded,
      messageId: event.messageId,
      sessionRef: sessionRef(userId),
    });
    if (recorded.historyRecorded && isFreshQuote(event.date, receivedAt))
      await match?.({ compactQuote, sourceMessageId: event.messageId, announcedAt: event.date });
  };
}
