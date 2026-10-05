import assert from "node:assert/strict";
import test from "node:test";
import {
  createTraderRuleProcessor,
  type TraderRuleProcessorDependencies,
} from "../src/trader-rule-processor";
import type {
  FindMatchingTraderRulesParams,
  RecordTraderRuleExecutionInput,
  TraderRuleExecution,
} from "@zarbit/db";

test("trader-rule-processor: evaluateOrderPlaced triggers Alert and Direct Fixed Follow", async () => {
  const sentPrivate: { userId: string; text: string }[] = [];
  const sentGroup: { userId: string; text: string }[] = [];
  const recordedExecutions: RecordTraderRuleExecutionInput[] = [];

  const mockRule = {
    id: "rule-1",
    userId: "user-1",
    traderAlias: "سناتور",
    trigger: "ORDER_PLACED" as const,
    side: "BUY" as const,
    minQuantity: 2,
    alertEnabled: true,
    followEnabled: true,
    followDirection: "DIRECT" as const,
    followSizing: "FIXED" as const,
    fixedQuantity: 1,
    maxQuantity: 2,
    status: "ENABLED" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: "user-1",
      telegramUserId: "tg-100",
      telegramSession: {
        state: "ACTIVE" as const,
        connectionState: "CONNECTED" as const,
      },
    },
  };

  const store: TraderRuleProcessorDependencies["store"] = {
    findMatchingTraderRules: async (params: FindMatchingTraderRulesParams) => {
      if (
        params.traderAlias === "سناتور" &&
        params.trigger === "ORDER_PLACED" &&
        params.quantity >= 2 &&
        (params.side === "BUY" || params.side === "BOTH")
      ) {
        return [mockRule];
      }
      return [];
    },
    recordTraderRuleExecution: async (
      input: RecordTraderRuleExecutionInput,
    ) => {
      recordedExecutions.push(input);
      return input as unknown as TraderRuleExecution;
    },
  };

  const delivery = {
    ready: async () => {},
    group: async (userId: string, text: string) => {
      sentGroup.push({ userId, text });
      return 1001;
    },
    private: async (telegramUserId: string, text: string) => {
      sentPrivate.push({ userId: telegramUserId, text });
      return 2001;
    },
  };

  const processor = createTraderRuleProcessor({ store, delivery });

  // Evaluate event
  await processor.evaluateOrderPlaced({
    traderAlias: "سناتور",
    side: "BUY",
    quantity: 3,
    compactPrice: 105020,
    messageId: 500,
    chatId: -100123456,
    announcedAt: new Date(),
  });

  // Verify private alert sent
  assert.equal(sentPrivate.length, 1);
  assert.equal(sentPrivate[0]?.userId, "tg-100");
  assert.ok(sentPrivate[0]?.text.includes("سناتور"));

  // Verify group follow order sent: Direct BUY, 1 unit (fixed) at 105020
  assert.equal(sentGroup.length, 1);
  assert.equal(sentGroup[0]?.userId, "user-1");
  assert.equal(sentGroup[0]?.text, "1خ105020");

  // Verify execution recorded
  assert.equal(recordedExecutions.length, 1);
  assert.equal(recordedExecutions[0]?.ruleId, "rule-1");
  assert.equal(recordedExecutions[0]?.alertStatus, "SENT");
  assert.equal(recordedExecutions[0]?.followStatus, "SUBMITTED");
  assert.equal(recordedExecutions[0]?.outgoingMessageId, 1001);
});

test("trader-rule-processor: evaluateTradeConfirmed triggers Inverse Follow with max cap", async () => {
  const sentPrivate: { userId: string; text: string }[] = [];
  const sentGroup: { userId: string; text: string }[] = [];
  const recordedExecutions: RecordTraderRuleExecutionInput[] = [];

  const mockRule = {
    id: "rule-2",
    userId: "user-2",
    traderAlias: "مرداد",
    trigger: "TRADE_CONFIRMED" as const,
    side: "SELL" as const,
    minQuantity: 2,
    alertEnabled: false,
    followEnabled: true,
    followDirection: "INVERSE" as const,
    followSizing: "SAME" as const,
    fixedQuantity: null,
    maxQuantity: 2, // Trader sells 5, but capped at 2
    status: "ENABLED" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: "user-2",
      telegramUserId: "tg-200",
      telegramSession: {
        state: "ACTIVE" as const,
        connectionState: "CONNECTED" as const,
      },
    },
  };

  const store: TraderRuleProcessorDependencies["store"] = {
    findMatchingTraderRules: async (params: FindMatchingTraderRulesParams) => {
      if (
        params.traderAlias === "مرداد" &&
        params.trigger === "TRADE_CONFIRMED" &&
        params.quantity >= 2 &&
        params.side === "SELL"
      ) {
        return [mockRule];
      }
      return [];
    },
    recordTraderRuleExecution: async (
      input: RecordTraderRuleExecutionInput,
    ) => {
      recordedExecutions.push(input);
      return input as unknown as TraderRuleExecution;
    },
  };

  const delivery = {
    ready: async () => {},
    group: async (userId: string, text: string) => {
      sentGroup.push({ userId, text });
      return 1002;
    },
    private: async (telegramUserId: string, text: string) => {
      sentPrivate.push({ userId: telegramUserId, text });
      return 2002;
    },
  };

  const processor = createTraderRuleProcessor({ store, delivery });

  // Evaluate trade event where Mordad is seller
  await processor.evaluateTradeConfirmed({
    buyerAlias: "خریدار_دیگر",
    sellerAlias: "مرداد",
    quantity: 5,
    compactPrice: 104950,
    messageId: 600,
    chatId: -100123456,
    announcedAt: new Date(),
  });

  // Verify alert skipped
  assert.equal(sentPrivate.length, 0);

  // Mordad sold 5. Inverse follow -> BUY. Capped at max 2.
  // Group message: 2خ104950
  assert.equal(sentGroup.length, 1);
  assert.equal(sentGroup[0]?.userId, "user-2");
  assert.equal(sentGroup[0]?.text, "2خ104950");

  assert.equal(recordedExecutions.length, 1);
  assert.equal(recordedExecutions[0]?.ruleId, "rule-2");
  assert.equal(recordedExecutions[0]?.followStatus, "SUBMITTED");
  assert.equal(recordedExecutions[0]?.followSide, "BUY");
  assert.equal(recordedExecutions[0]?.followQuantity, 2);
});

test("trader-rule-processor: ignores events when quantity below minQuantity", async () => {
  const sentGroup: { userId: string; text: string }[] = [];
  const store: TraderRuleProcessorDependencies["store"] = {
    findMatchingTraderRules: async () => {
      return [];
    },
    recordTraderRuleExecution: async () => null,
  };
  const delivery = {
    ready: async () => {},
    group: async () => 0,
    private: async () => 0,
  };

  const processor = createTraderRuleProcessor({ store, delivery });

  await processor.evaluateOrderPlaced({
    traderAlias: "سناتور",
    side: "BUY",
    quantity: 1, // below minQuantity 3
    compactPrice: 105000,
    messageId: 700,
    chatId: -100123456,
    announcedAt: new Date(),
  });

  assert.equal(sentGroup.length, 0);
});
