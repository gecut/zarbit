import type {
  Store,
  TradingSide,
  TraderRuleTrigger,
  TraderRuleAlertStatus,
  TraderRuleFollowStatus,
} from "@zarbit/db";
import { formatGroupMessage } from "@zarbit/domain";
import { formatTraderRuleAlertMessage } from "@zarbit/messages";
import { workerLog } from "./logger";

export interface TraderRuleDelivery {
  ready(userId: string): Promise<void>;
  group(userId: string, text: string): Promise<number>;
  private(telegramUserId: string, text: string): Promise<number>;
}

export interface TraderRuleProcessorDependencies {
  readonly store: Pick<
    Store,
    "findMatchingTraderRules" | "recordTraderRuleExecution"
  >;
  readonly delivery: TraderRuleDelivery;
}

export interface TraderRuleOrderEvent {
  traderAlias: string;
  side: TradingSide;
  quantity: number;
  compactPrice: number;
  messageId: number;
  chatId: bigint | number;
  announcedAt: Date;
}

export interface TraderRuleTradeEvent {
  buyerAlias?: string | null;
  sellerAlias?: string | null;
  quantity: number;
  compactPrice: number;
  messageId: number;
  chatId: bigint | number;
  announcedAt: Date;
}

export function createTraderRuleProcessor(
  deps: TraderRuleProcessorDependencies,
) {
  const { store, delivery } = deps;

  const processMatchedRule = async (
    rule: Awaited<ReturnType<typeof store.findMatchingTraderRules>>[number],
    event: {
      trigger: TraderRuleTrigger;
      side: TradingSide;
      quantity: number;
      price: number;
      messageId: number;
      chatId: bigint | number;
      announcedAt: Date;
    },
  ) => {
    let alertStatus: TraderRuleAlertStatus = "SKIPPED";
    let followStatus: TraderRuleFollowStatus = "SKIPPED";
    let followSide: TradingSide | null = null;
    let followQuantity: number | null = null;
    let outgoingMessageId: number | null = null;
    let errorMessage: string | null = null;

    // 1. Execute Alert if enabled
    if (rule.alertEnabled && rule.user.telegramUserId) {
      try {
        const text = formatTraderRuleAlertMessage({
          traderAlias: rule.traderAlias,
          trigger: event.trigger,
          side: event.side,
          quantity: event.quantity,
          price: event.price,
          announcedAt: event.announcedAt,
        });
        await delivery.private(rule.user.telegramUserId, text);
        alertStatus = "SENT";
      } catch (error) {
        alertStatus = "FAILED";
        errorMessage =
          error instanceof Error ? error.message : "خطا در ارسال پیام هشدار";
        workerLog.failure("trader_rule.alert.failed", error, {
          ruleId: rule.id,
          userId: rule.userId,
        });
      }
    }

    // 2. Execute Follow if enabled
    if (rule.followEnabled) {
      try {
        // Calculate Follow Direction
        const isInverse = rule.followDirection === "INVERSE";
        followSide = isInverse
          ? event.side === "BUY"
            ? "SELL"
            : "BUY"
          : event.side;

        // Calculate Follow Sizing
        let targetQty =
          rule.followSizing === "FIXED"
            ? (rule.fixedQuantity ?? 1)
            : event.quantity;

        if (rule.maxQuantity && rule.maxQuantity > 0) {
          targetQty = Math.min(targetQty, rule.maxQuantity);
        }
        followQuantity = Math.max(1, targetQty);

        // Check user session readiness
        await delivery.ready(rule.userId);

        // Send order to group
        const orderText = formatGroupMessage(
          followSide,
          followQuantity,
          event.price,
        );
        outgoingMessageId = await delivery.group(rule.userId, orderText);
        followStatus = "SUBMITTED";

        workerLog.info("trader_rule.follow.submitted", {
          ruleId: rule.id,
          userId: rule.userId,
          followSide,
          followQuantity,
          price: event.price,
          outgoingMessageId,
        });
      } catch (error) {
        followStatus = "FAILED";
        const errText =
          error instanceof Error
            ? error.message
            : "خطا در ارسال سفارش دنبال‌کردن";
        errorMessage = errorMessage ? `${errorMessage}; ${errText}` : errText;
        workerLog.failure("trader_rule.follow.failed", error, {
          ruleId: rule.id,
          userId: rule.userId,
        });
      }
    }

    // 3. Record Execution Log
    try {
      await store.recordTraderRuleExecution({
        ruleId: rule.id,
        userId: rule.userId,
        traderAlias: rule.traderAlias,
        trigger: event.trigger,
        eventSide: event.side,
        eventQuantity: event.quantity,
        eventPrice: event.price,
        sourceMessageId: event.messageId,
        chatId: event.chatId,
        alertStatus,
        followStatus,
        followSide,
        followQuantity,
        followPrice: rule.followEnabled ? event.price : null,
        outgoingMessageId,
        errorMessage,
      });
    } catch (error) {
      workerLog.failure("trader_rule.execution_log.failed", error, {
        ruleId: rule.id,
      });
    }
  };

  return {
    evaluateOrderPlaced: async (event: TraderRuleOrderEvent): Promise<void> => {
      try {
        const rules = await store.findMatchingTraderRules({
          traderAlias: event.traderAlias,
          trigger: "ORDER_PLACED",
          side: event.side,
          quantity: event.quantity,
        });

        if (rules.length === 0) return;

        workerLog.info("trader_rule.order_placed.matched", {
          traderAlias: event.traderAlias,
          matchCount: rules.length,
          messageId: event.messageId,
        });

        for (const rule of rules) {
          await processMatchedRule(rule, {
            trigger: "ORDER_PLACED",
            side: event.side,
            quantity: event.quantity,
            price: event.compactPrice,
            messageId: event.messageId,
            chatId: event.chatId,
            announcedAt: event.announcedAt,
          });
        }
      } catch (error) {
        workerLog.failure("trader_rule.order_evaluation.failed", error, {
          traderAlias: event.traderAlias,
          messageId: event.messageId,
        });
      }
    },

    evaluateTradeConfirmed: async (
      event: TraderRuleTradeEvent,
    ): Promise<void> => {
      try {
        // Buyer side evaluation
        if (event.buyerAlias) {
          const buyerRules = await store.findMatchingTraderRules({
            traderAlias: event.buyerAlias,
            trigger: "TRADE_CONFIRMED",
            side: "BUY",
            quantity: event.quantity,
          });

          for (const rule of buyerRules) {
            await processMatchedRule(rule, {
              trigger: "TRADE_CONFIRMED",
              side: "BUY",
              quantity: event.quantity,
              price: event.compactPrice,
              messageId: event.messageId,
              chatId: event.chatId,
              announcedAt: event.announcedAt,
            });
          }
        }

        // Seller side evaluation
        if (event.sellerAlias) {
          const sellerRules = await store.findMatchingTraderRules({
            traderAlias: event.sellerAlias,
            trigger: "TRADE_CONFIRMED",
            side: "SELL",
            quantity: event.quantity,
          });

          for (const rule of sellerRules) {
            await processMatchedRule(rule, {
              trigger: "TRADE_CONFIRMED",
              side: "SELL",
              quantity: event.quantity,
              price: event.compactPrice,
              messageId: event.messageId,
              chatId: event.chatId,
              announcedAt: event.announcedAt,
            });
          }
        }
      } catch (error) {
        workerLog.failure("trader_rule.trade_evaluation.failed", error, {
          buyerAlias: event.buyerAlias,
          sellerAlias: event.sellerAlias,
          messageId: event.messageId,
        });
      }
    },
  };
}
