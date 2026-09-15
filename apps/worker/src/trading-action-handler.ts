import type {
  Store,
  TradingActionStatus,
  TradingActionType,
  TradingSide,
} from "@zarbit/db";
import {
  normalizeProtocolText,
  parseContextCommand,
  parseHumanOrder,
} from "@zarbit/domain";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";
import type { BoundedMessageDeduplicator } from "./message-deduplicator";
import type { BoundedOrderCache } from "./order-cache";
import type { CanonicalOrderObservation } from "./participant-identity";

export interface TradingActionHandlerDependencies {
  readonly store: Partial<Pick<Store, "recordTradingAction">>;
  readonly deduplicator: BoundedMessageDeduplicator;
  readonly activeOrders: BoundedOrderCache;
  readonly resolveIdentity: (
    canonical: CanonicalOrderObservation,
  ) => Promise<void>;
  readonly getLatestCompactQuote: () => number | null;
}

export function createTradingActionHandler(
  deps: TradingActionHandlerDependencies,
) {
  const {
    store,
    deduplicator,
    activeOrders,
    resolveIdentity,
    getLatestCompactQuote,
  } = deps;

  return async (userId: string, event: QuoteEvent): Promise<void> => {
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

      deduplicator.add(event.messageId, "action", event.chatId);

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
        workerLog.debug("telegram.action.duplicate", {
          chatId: event.chatId,
          messageId: event.messageId,
          sessionRef: sessionRef(userId),
        });
      }

      return recorded.actionRecorded;
    };

    const triggerRetroactiveIdentityResolution = async () => {
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
    };

    // 2.1 Explicit human order: ORDER_BUY or ORDER_SELL
    const humanOrderResult = parseHumanOrder(event.text, {
      referenceQuote: getLatestCompactQuote() ?? undefined,
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
        await triggerRetroactiveIdentityResolution();
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
        await triggerRetroactiveIdentityResolution();
      }
      return;
    }

    // 2.2 Contextual trading commands: TAKE_ALL, TAKE_QUANTITY, CANCEL
    const commandResult = parseContextCommand(event.text);
    if (commandResult.status === "parsed") {
      const repliedOrderId = event.replyToMessageId ?? null;
      const targetOrder =
        repliedOrderId !== null ? activeOrders.get(repliedOrderId) : undefined;
      const hasActiveRepliedOrder =
        targetOrder !== undefined && targetOrder.remaining > 0;

      // Command: "ب" (TAKE_ALL)
      if (commandResult.data.command === "TAKE_ALL") {
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
      if (commandResult.data.command === "CANCEL") {
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

      // Command: Standalone numeric reply (TAKE_QUANTITY)
      if (commandResult.data.command === "TAKE_QUANTITY") {
        const value = commandResult.data.quantity;
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
        // Per MARKET-DATA.md line 114: If reply metadata is absent on contextual commands (ب, 1, ن), the target order must be marked as UNRESOLVED_TARGET, never guessed.
        if (value === 1) {
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

        // Other standalone numbers without reply: unlabelled quote inputs or non-trading numbers, ignore per MARKET-DATA.
        return;
      }
    }

    // 2.3 Other/free-form messages: Do not store unrelated free-form chat messages.
  };
}
