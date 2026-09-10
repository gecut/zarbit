import type { Store } from "@zarbit/db";
import {
  isFreshQuote,
  parseCanonicalBotOrder,
  parseCanonicalBotQuote,
  parseTradeReceipt,
} from "@zarbit/domain";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";

export class BoundedMessageDeduplicator {
  private readonly seen = new Map<number, "quote" | "trade">();
  private readonly maxSize: number;

  constructor(maxSize = 2_000) {
    this.maxSize = maxSize;
  }

  has(messageId: number): "quote" | "trade" | undefined {
    return this.seen.get(messageId);
  }

  add(messageId: number, kind: "quote" | "trade"): void {
    if (this.seen.size >= this.maxSize) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey !== undefined) {
        this.seen.delete(oldestKey);
      }
    }
    this.seen.set(messageId, kind);
  }
}

export type MarketDataStore = Pick<Store, "recordQuote"> &
  Partial<Pick<Store, "recordTrade">>;

export function createQuoteRecorder(
  store: MarketDataStore,
  config: { groupId: number; senderId: string },
  match?: (quote: {
    compactQuote: number;
    sourceMessageId: number;
    announcedAt: Date;
  }) => Promise<void>,
) {
  const deduplicator = new BoundedMessageDeduplicator(2_000);

  return async (userId: string, _revision: number, event: QuoteEvent) => {
    if (event.chatId !== config.groupId || event.senderId !== config.senderId) {
      workerLog.debug("telegram.quote.ignored", {
        reason: "unexpected_source",
        sessionRef: sessionRef(userId),
      });
      return;
    }

    const seenKind = deduplicator.has(event.messageId);
    if (seenKind === "quote") {
      workerLog.info("telegram.quote.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (seenKind === "trade") {
      workerLog.info("telegram.trade.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    // 1. Authoritative canonical quote announcement
    const quoteResult = parseCanonicalBotQuote(event.text);
    if (quoteResult.status === "parsed") {
      const compactQuote = quoteResult.data.compactQuote;
      const receivedAt = new Date();
      const recorded = await store.recordQuote({
        compactQuote,
        announcedAt: event.date,
        receivedAt,
        sourceMessageId: event.messageId,
        chatId: event.chatId,
      });
      deduplicator.add(event.messageId, "quote");

      if (recorded.historyRecorded) {
        workerLog.info("telegram.quote.recorded", {
          chatId: event.chatId,
          compactQuote,
          historyRecorded: true,
          latestUpdated: recorded.latestUpdated ?? true,
          messageId: event.messageId,
          sessionRef: sessionRef(userId),
        });
        if (
          (recorded.latestUpdated ?? recorded.historyRecorded) &&
          isFreshQuote(event.date, receivedAt)
        ) {
          await match?.({
            compactQuote,
            sourceMessageId: event.messageId,
            announcedAt: event.date,
          });
        }
      } else {
        workerLog.info("telegram.quote.duplicate", {
          chatId: event.chatId,
          compactQuote,
          messageId: event.messageId,
          sessionRef: sessionRef(userId),
        });
      }
      return;
    }
    if (quoteResult.status === "ambiguous") {
      workerLog.warn("telegram.authoritative.invalid", {
        chatId: event.chatId,
        messageId: event.messageId,
        reason: quoteResult.reason,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    // 2. Authoritative bot trade receipt (حواله)
    const receiptResult = parseTradeReceipt(event.text);
    if (receiptResult.status === "parsed") {
      if (!store.recordTrade) {
        return;
      }
      const receipt = receiptResult.data;
      const recorded = await store.recordTrade({
        chatId: event.chatId,
        sourceMessageId: event.messageId,
        referenceNumber: receipt.referenceNumber,
        buyerAlias: receipt.buyerAlias,
        sellerAlias: receipt.sellerAlias,
        quantity: receipt.quantity,
        compactPrice: receipt.compactPrice,
        rawPrice: BigInt(receipt.displayedPrice),
        receiptTimeText: receipt.rawTimeText,
        announcedAt: event.date,
      });
      deduplicator.add(event.messageId, "trade");

      if (recorded.tradeRecorded) {
        workerLog.info("telegram.trade.recorded", {
          buyerAlias: receipt.buyerAlias,
          chatId: event.chatId,
          compactPrice: receipt.compactPrice,
          messageId: event.messageId,
          quantity: receipt.quantity,
          referenceNumber: receipt.referenceNumber,
          sellerAlias: receipt.sellerAlias,
          sessionRef: sessionRef(userId),
        });
      } else {
        workerLog.info("telegram.trade.duplicate", {
          chatId: event.chatId,
          messageId: event.messageId,
          referenceNumber: receipt.referenceNumber,
          sessionRef: sessionRef(userId),
        });
      }
      return;
    }
    if (receiptResult.status === "ambiguous") {
      workerLog.warn("telegram.authoritative.invalid", {
        chatId: event.chatId,
        messageId: event.messageId,
        reason: receiptResult.reason,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    // 3. Authoritative canonical bot active order (must NOT create a Trade)
    const orderResult = parseCanonicalBotOrder(event.text);
    if (orderResult.status === "parsed") {
      workerLog.debug("telegram.order.observed", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (orderResult.status === "ambiguous") {
      workerLog.warn("telegram.authoritative.invalid", {
        chatId: event.chatId,
        messageId: event.messageId,
        reason: orderResult.reason,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    // 4. Unrecognized authoritative bot message
    workerLog.warn("telegram.authoritative.invalid", {
      chatId: event.chatId,
      messageId: event.messageId,
      reason: "Unrecognized authoritative bot message format",
      sessionRef: sessionRef(userId),
    });
  };
}
