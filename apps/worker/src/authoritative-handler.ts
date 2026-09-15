import type { Store } from "@zarbit/db";
import {
  parseCanonicalBotOrder,
  parseCanonicalBotQuote,
  parseTradeReceipt,
} from "@zarbit/domain";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";
import type { BoundedMessageDeduplicator } from "./message-deduplicator";
import type { BoundedOrderCache } from "./order-cache";
import type { CanonicalOrderObservation } from "./participant-identity";

export interface AuthoritativeHandlerDependencies {
  readonly store: Pick<Store, "recordQuote"> &
    Partial<Pick<Store, "recordTrade">>;
  readonly deduplicator: BoundedMessageDeduplicator;
  readonly activeOrders: BoundedOrderCache;
  readonly resolveIdentity: (
    canonical: CanonicalOrderObservation,
  ) => Promise<void>;
  readonly onQuoteRecorded?: (compactQuote: number) => void;
  readonly onTradeRecorded?: () => void;
}

export function createAuthoritativeHandler(
  deps: AuthoritativeHandlerDependencies,
) {
  const {
    store,
    deduplicator,
    activeOrders,
    resolveIdentity,
    onQuoteRecorded,
    onTradeRecorded,
  } = deps;

  return async (userId: string, event: QuoteEvent): Promise<void> => {
    // 1.1 Canonical quote announcement
    const quoteResult = parseCanonicalBotQuote(event.text);
    if (quoteResult.status === "parsed") {
      const compactQuote = quoteResult.data.compactQuote;
      onQuoteRecorded?.(compactQuote);
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

    // 1.2 Authoritative bot trade receipt (حواله)
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
        onTradeRecorded?.();
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

    // 1.3 Authoritative canonical bot active order
    const orderResult = parseCanonicalBotOrder(event.text);
    if (orderResult.status === "parsed") {
      activeOrders.set(
        event.messageId,
        orderResult.data,
        event.date,
        event.replyToMessageId ?? null,
      );
      await resolveIdentity({
        chatId: event.chatId,
        messageId: event.messageId,
        observedAt: event.date,
        order: orderResult.data,
        replyToMessageId: event.replyToMessageId ?? null,
      });
      workerLog.debug("telegram.order.observed", {
        chatId: event.chatId,
        compactPrice: orderResult.data.compactPrice,
        messageId: event.messageId,
        participantAlias: orderResult.data.participantAlias,
        quantity: orderResult.data.quantity,
        remaining: orderResult.data.remaining,
        side: orderResult.data.side,
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

    // 1.4 Unrecognized authoritative bot message
    workerLog.warn("telegram.authoritative.invalid", {
      chatId: event.chatId,
      messageId: event.messageId,
      reason: "Unrecognized authoritative bot message format",
      sessionRef: sessionRef(userId),
    });
  };
}
