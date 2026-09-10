import type {
  Store,
  TradingActionStatus,
  TradingActionType,
  TradingSide,
} from "@zarbit/db";
import {
  isFreshQuote,
  normalizeCompactText,
  normalizeProtocolText,
  parseCanonicalBotOrder,
  parseCanonicalBotQuote,
  parseHumanOrder,
  parseTradeReceipt,
  type CanonicalBotOrder,
} from "@zarbit/domain";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";
import {
  resolveParticipantIdentity,
  type CanonicalOrderObservation,
} from "./participant-identity";

export class BoundedMessageDeduplicator {
  private readonly seen = new Map<number, "quote" | "trade" | "action">();
  private readonly maxSize: number;

  constructor(maxSize = 2_000) {
    this.maxSize = maxSize;
  }

  has(messageId: number): "quote" | "trade" | "action" | undefined {
    return this.seen.get(messageId);
  }

  add(messageId: number, kind: "quote" | "trade" | "action"): void {
    if (this.seen.size >= this.maxSize) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey !== undefined) {
        this.seen.delete(oldestKey);
      }
    }
    this.seen.set(messageId, kind);
  }
}

export class BoundedOrderCache {
  private readonly orders = new Map<
    number,
    CanonicalBotOrder & {
      botMessageId: number;
      observedAt: Date;
      replyToMessageId?: number | null;
    }
  >();
  private readonly maxSize: number;

  constructor(maxSize = 2_000) {
    this.maxSize = maxSize;
  }

  get(messageId: number):
    | (CanonicalBotOrder & {
        botMessageId: number;
        observedAt: Date;
        replyToMessageId?: number | null;
      })
    | undefined {
    return this.orders.get(messageId);
  }

  set(
    messageId: number,
    order: CanonicalBotOrder,
    observedAt: Date,
    replyToMessageId?: number | null,
  ): void {
    if (this.orders.size >= this.maxSize) {
      const oldestKey = this.orders.keys().next().value;
      if (oldestKey !== undefined) {
        this.orders.delete(oldestKey);
      }
    }
    this.orders.set(messageId, {
      ...order,
      botMessageId: messageId,
      observedAt,
      replyToMessageId: replyToMessageId ?? null,
    });
  }

  findRecent(
    windowStart: Date,
    windowEnd: Date,
  ): Array<
    CanonicalBotOrder & {
      botMessageId: number;
      observedAt: Date;
      replyToMessageId?: number | null;
    }
  > {
    const result: Array<
      CanonicalBotOrder & {
        botMessageId: number;
        observedAt: Date;
        replyToMessageId?: number | null;
      }
    > = [];
    for (const order of this.orders.values()) {
      if (order.observedAt >= windowStart && order.observedAt <= windowEnd) {
        result.push(order);
      }
    }
    return result;
  }
}

export type MarketDataStore = Pick<Store, "recordQuote"> &
  Partial<Pick<Store, "recordTrade">> &
  Partial<Pick<Store, "recordTradingAction">> &
  Partial<
    Pick<
      Store,
      | "confirmParticipantIdentity"
      | "findTradingActionForIdentityCorrelation"
      | "findCandidateActionsForIdentityCorrelation"
    >
  > &
  Partial<Pick<Store, "latestQuote">>;

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
  const activeOrders = new BoundedOrderCache(2_000);
  let latestCompactQuote: number | null = null;

  if (store.latestQuote) {
    void store
      .latestQuote()
      .then((latest) => {
        if (latest && latestCompactQuote === null) {
          latestCompactQuote = latest.compactQuote;
        }
      })
      .catch(() => {
        // Startup quote lookup is non-blocking.
      });
  }

  const resolveIdentity = async (canonical: CanonicalOrderObservation) => {
    if (
      !store.confirmParticipantIdentity ||
      !store.findCandidateActionsForIdentityCorrelation
    ) {
      return;
    }

    try {
      const result = await resolveParticipantIdentity(
        {
          confirmParticipantIdentity: store.confirmParticipantIdentity,
          findTradingActionForIdentityCorrelation:
            store.findTradingActionForIdentityCorrelation ?? (async () => null),
          findCandidateActionsForIdentityCorrelation:
            store.findCandidateActionsForIdentityCorrelation,
        },
        canonical,
        config.senderId,
      );

      if (!result || result.outcome === "rejected") {
        workerLog.info(
          "telegram.participant_identity.ambiguous_correlation_ignored",
          {
            canonicalMessageId: canonical.messageId,
            chatId: canonical.chatId,
            participantAlias: canonical.order.participantAlias,
          },
        );
        return;
      }

      if (result.outcome === "duplicate") {
        workerLog.debug("telegram.participant_identity.duplicate", {
          canonicalMessageId: canonical.messageId,
          chatId: canonical.chatId,
          participantAlias: canonical.order.participantAlias,
        });
        return;
      }

      if (result.outcome === "confirmed") {
        workerLog.info("telegram.participant_identity.evidence_accepted", {
          canonicalMessageId: canonical.messageId,
          chatId: canonical.chatId,
          confirmationCount: result.confirmationCount,
          participantAlias: canonical.order.participantAlias,
          verified: result.verified,
        });
        if (result.verified) {
          workerLog.info(
            "telegram.participant_identity.verification_completed",
            {
              canonicalMessageId: canonical.messageId,
              chatId: canonical.chatId,
              confirmationCount: result.confirmationCount,
              participantAlias: canonical.order.participantAlias,
            },
          );
        }
        return;
      }

      if (result.outcome === "conflict") {
        workerLog.warn("telegram.participant_identity.conflict", {
          canonicalMessageId: canonical.messageId,
          chatId: canonical.chatId,
          participantAlias: canonical.order.participantAlias,
          resolutionStatus: result.resolutionStatus,
        });
        return;
      }
    } catch (error) {
      workerLog.failure("telegram.participant_identity.failed", error, {
        canonicalMessageId: canonical.messageId,
        chatId: canonical.chatId,
        participantAlias: canonical.order.participantAlias,
      });
    }
  };

  return async (userId: string, _revision: number, event: QuoteEvent) => {
    if (event.chatId !== config.groupId) {
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
    if (seenKind === "action") {
      workerLog.info("telegram.action.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    // --- 1. Authoritative Bot Messages (senderId === config.senderId) ---
    if (event.senderId === config.senderId) {
      // 1.1 Canonical quote announcement
      const quoteResult = parseCanonicalBotQuote(event.text);
      if (quoteResult.status === "parsed") {
        const compactQuote = quoteResult.data.compactQuote;
        latestCompactQuote = compactQuote;
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
      return;
    }

    // --- 2. Human Trading Actions (senderId !== config.senderId) ---
    if (!store.recordTradingAction) {
      return;
    }

    const recordAction = async (input: {
      actionType: TradingActionType;
      side?: TradingSide | null;
      quantity: number | null;
      compactPrice: number | null;
      replyToMessageId: number | null;
      replyToSenderId: string | null;
      targetOrderMessageId: number | null;
      status: TradingActionStatus;
    }): Promise<boolean> => {
      const recorded = await store.recordTradingAction!({
        chatId: event.chatId,
        sourceMessageId: event.messageId,
        senderId: event.senderId,
        actionType: input.actionType,
        side: input.side ?? null,
        rawText: event.text,
        quantity: input.quantity,
        compactPrice: input.compactPrice,
        replyToMessageId: input.replyToMessageId,
        replyToSenderId: input.replyToSenderId,
        targetOrderMessageId: input.targetOrderMessageId,
        status: input.status,
        confirmedByMessageId: null,
        participantId: null,
        observedAt: event.date,
      });

      deduplicator.add(event.messageId, "action");

      if (recorded.actionRecorded) {
        workerLog.info("telegram.action.recorded", {
          actionType: input.actionType,
          side: input.side ?? null,
          chatId: event.chatId,
          compactPrice: input.compactPrice,
          messageId: event.messageId,
          quantity: input.quantity,
          replyToMessageId: input.replyToMessageId,
          senderId: event.senderId,
          status: input.status,
          targetOrderMessageId: input.targetOrderMessageId,
          sessionRef: sessionRef(userId),
        });
      } else {
        workerLog.info("telegram.action.duplicate", {
          chatId: event.chatId,
          messageId: event.messageId,
          sessionRef: sessionRef(userId),
        });
      }

      return recorded.actionRecorded;
    };

    // 2.1 Explicit human order: ORDER_BUY or ORDER_SELL
    const humanOrderResult = parseHumanOrder(event.text, {
      referenceQuote: latestCompactQuote ?? undefined,
    });

    if (humanOrderResult.status === "parsed") {
      const { side, quantity, resolvedCompactPrice } = humanOrderResult.data;
      const actionType: TradingActionType =
        side === "BUY" ? "ORDER_BUY" : "ORDER_SELL";
      const status: TradingActionStatus =
        resolvedCompactPrice !== null ? "OBSERVED" : "AMBIGUOUS";

      const actionRecorded = await recordAction({
        actionType,
        side,
        quantity,
        compactPrice: resolvedCompactPrice,
        replyToMessageId: event.replyToMessageId ?? null,
        replyToSenderId: event.replyToSenderId ?? null,
        targetOrderMessageId: null,
        status,
      });
      if (actionRecorded) {
        const recentCanonicals = activeOrders.findRecent(
          event.date,
          new Date(event.date.getTime() + 1_500),
        );
        for (const canonical of recentCanonicals) {
          if (canonical.botMessageId > event.messageId) {
            await resolveIdentity({
              chatId: event.chatId,
              messageId: canonical.botMessageId,
              observedAt: canonical.observedAt,
              order: canonical,
              replyToMessageId: canonical.replyToMessageId ?? null,
            });
          }
        }
      }
      return;
    }

    if (humanOrderResult.status === "ambiguous") {
      const normalized = normalizeProtocolText(event.text);
      const isBuy = normalized.includes("خ");
      const actionType: TradingActionType = isBuy ? "ORDER_BUY" : "ORDER_SELL";
      const side: TradingSide = isBuy ? "BUY" : "SELL";

      const actionRecorded = await recordAction({
        actionType,
        side,
        quantity: null,
        compactPrice: null,
        replyToMessageId: event.replyToMessageId ?? null,
        replyToSenderId: event.replyToSenderId ?? null,
        targetOrderMessageId: null,
        status: "AMBIGUOUS",
      });
      if (actionRecorded) {
        const recentCanonicals = activeOrders.findRecent(
          event.date,
          new Date(event.date.getTime() + 1_500),
        );
        for (const canonical of recentCanonicals) {
          if (canonical.botMessageId > event.messageId) {
            await resolveIdentity({
              chatId: event.chatId,
              messageId: canonical.botMessageId,
              observedAt: canonical.observedAt,
              order: canonical,
              replyToMessageId: canonical.replyToMessageId ?? null,
            });
          }
        }
      }
      return;
    }

    // 2.2 Contextual trading commands: TAKE_ALL, TAKE_QUANTITY, CANCEL
    const normalized = normalizeProtocolText(event.text);
    if (normalized.includes("\n")) {
      // Free-form multiline chat messages must not be stored.
      return;
    }

    const compact = normalizeCompactText(normalized);
    const repliedOrderId = event.replyToMessageId ?? null;
    const targetOrder =
      repliedOrderId !== null ? activeOrders.get(repliedOrderId) : undefined;
    const hasActiveRepliedOrder =
      targetOrder !== undefined && targetOrder.remaining > 0;

    // Command: "ب" (TAKE_ALL)
    if (compact === "ب") {
      let quantity: number | null = null;
      let compactPrice: number | null = null;
      let status: TradingActionStatus = "UNRESOLVED_TARGET";
      let targetOrderMessageId: number | null = null;
      let side: TradingSide | null = null;

      if (hasActiveRepliedOrder && targetOrder) {
        quantity = targetOrder.remaining;
        compactPrice = targetOrder.compactPrice;
        targetOrderMessageId = targetOrder.botMessageId;
        side = targetOrder.side === "SELL" ? "BUY" : "SELL";
        status = "OBSERVED";
      } else if (repliedOrderId !== null) {
        targetOrderMessageId = repliedOrderId;
        status = "UNRESOLVED_TARGET";
      }

      await recordAction({
        actionType: "TAKE_ALL",
        side,
        quantity,
        compactPrice,
        replyToMessageId: repliedOrderId,
        replyToSenderId: event.replyToSenderId ?? null,
        targetOrderMessageId,
        status,
      });
      return;
    }

    // Command: "ن" (CANCEL)
    if (compact === "ن") {
      let quantity: number | null = null;
      let compactPrice: number | null = null;
      let status: TradingActionStatus = "UNRESOLVED_TARGET";
      let targetOrderMessageId: number | null = null;

      if (hasActiveRepliedOrder && targetOrder) {
        quantity = targetOrder.remaining;
        compactPrice = targetOrder.compactPrice;
        targetOrderMessageId = targetOrder.botMessageId;
        status = "OBSERVED";
      } else if (repliedOrderId !== null) {
        targetOrderMessageId = repliedOrderId;
        status = "UNRESOLVED_TARGET";
      }

      await recordAction({
        actionType: "CANCEL",
        side: null,
        quantity,
        compactPrice,
        replyToMessageId: repliedOrderId,
        replyToSenderId: event.replyToSenderId ?? null,
        targetOrderMessageId,
        status,
      });
      return;
    }

    // Standalone numeric command (TAKE_QUANTITY)
    if (/^\d+$/u.test(compact)) {
      const value = Number(compact);
      if (!Number.isSafeInteger(value) || value <= 0) {
        return;
      }

      if (repliedOrderId !== null) {
        let compactPrice: number | null = null;
        let status: TradingActionStatus = "UNRESOLVED_TARGET";
        const targetOrderMessageId: number = repliedOrderId;
        let side: TradingSide | null = null;

        if (hasActiveRepliedOrder && targetOrder) {
          compactPrice = targetOrder.compactPrice;
          side = targetOrder.side === "SELL" ? "BUY" : "SELL";
          if (value <= targetOrder.remaining) {
            status = "OBSERVED";
          } else {
            status = "AMBIGUOUS";
          }
        }

        await recordAction({
          actionType: "TAKE_QUANTITY",
          side,
          quantity: value,
          compactPrice,
          replyToMessageId: repliedOrderId,
          replyToSenderId: event.replyToSenderId ?? null,
          targetOrderMessageId,
          status,
        });
        return;
      }

      // Standalone number WITHOUT reply metadata:
      // Per MARKET-DATA.md line 114: "If reply metadata is absent on contextual commands (ب, 1, ن), the target order must be marked as UNRESOLVED_TARGET, never guessed."
      if (compact === "1") {
        await recordAction({
          actionType: "TAKE_QUANTITY",
          side: null,
          quantity: 1,
          compactPrice: null,
          replyToMessageId: null,
          replyToSenderId: null,
          targetOrderMessageId: null,
          status: "UNRESOLVED_TARGET",
        });
        return;
      }

      // Other standalone numbers (e.g. 930, 105020) without reply:
      // These are unlabelled quote inputs or non-trading numbers, ignore according to MARKET-DATA.
      return;
    }

    // 2.3 Other/free-form messages: Do not store unrelated free-form chat messages.
  };
}
