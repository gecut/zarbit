import assert from "node:assert/strict";
import test from "node:test";
import {
  createTraderRuleStore,
  type CreateTraderRuleInput,
  type RecordTraderRuleExecutionInput,
} from "../src/trader-rules";
import type {
  TraderRule,
  TraderRuleExecution,
  PrismaClient,
} from "../prisma/generated/client";

test("trader-rules: create, toggle, update, delete mock store flow", async () => {
  const rules = new Map<string, TraderRule>();
  const executions: TraderRuleExecution[] = [];
  const participants = new Set<string>();

  const mockPrisma = {
    participant: {
      upsert: async (args: { where: { id: string } }) => {
        participants.add(args.where.id);
        return { id: args.where.id };
      },
    },
    traderRule: {
      findMany: async (args: {
        where?: {
          userId?: string;
          traderAlias?: string;
          trigger?: string;
          status?: string;
          minQuantity?: { lte?: number };
          OR?: Array<{ side: string }>;
        };
      }) => {
        let list = Array.from(rules.values());
        if (args.where?.userId) {
          list = list.filter((r) => r.userId === args.where?.userId);
        }
        if (args.where?.traderAlias) {
          list = list.filter((r) => r.traderAlias === args.where?.traderAlias);
        }
        if (args.where?.trigger) {
          list = list.filter((r) => r.trigger === args.where?.trigger);
        }
        if (args.where?.status) {
          list = list.filter((r) => r.status === args.where?.status);
        }
        if (args.where?.minQuantity?.lte !== undefined) {
          const lte = args.where.minQuantity.lte;
          list = list.filter((r) => r.minQuantity <= lte);
        }
        if (args.where?.OR) {
          list = list.filter((r) => r.side === "BOTH" || r.side === "BUY");
        }
        return list;
      },
      findFirst: async (args: { where: { id: string; userId?: string } }) => {
        const item = rules.get(args.where.id);
        if (!item) return null;
        if (args.where.userId && item.userId !== args.where.userId) return null;
        return item;
      },
      create: async (args: {
        data: CreateTraderRuleInput & { userId: string; status: "ENABLED" };
      }) => {
        const id = "rule-" + String(rules.size + 1);
        const record: TraderRule = {
          id,
          userId: args.data.userId,
          traderAlias: args.data.traderAlias,
          trigger: args.data.trigger,
          side: args.data.side,
          minQuantity: args.data.minQuantity ?? 1,
          alertEnabled: args.data.alertEnabled ?? true,
          followEnabled: args.data.followEnabled ?? false,
          followDirection: args.data.followDirection ?? null,
          followSizing: args.data.followSizing ?? null,
          fixedQuantity: args.data.fixedQuantity ?? null,
          maxQuantity: args.data.maxQuantity ?? null,
          status: args.data.status,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rules.set(id, record);
        return record;
      },
      update: async (args: {
        where: { id: string };
        data: Partial<TraderRule>;
      }) => {
        const item = rules.get(args.where.id);
        if (!item) throw new Error("Not found");
        const updated: TraderRule = {
          ...item,
          ...args.data,
          updatedAt: new Date(),
        };
        rules.set(args.where.id, updated);
        return updated;
      },
      delete: async (args: { where: { id: string } }) => {
        rules.delete(args.where.id);
        return {};
      },
    },
    traderRuleExecution: {
      findMany: async (args: {
        where?: { userId?: string; ruleId?: string };
        take?: number;
      }) => {
        let list = executions;
        if (args.where?.userId) {
          list = list.filter((e) => e.userId === args.where?.userId);
        }
        return list.slice(0, args.take ?? 50);
      },
      create: async (args: {
        data: RecordTraderRuleExecutionInput & { chatId?: bigint | null };
      }) => {
        const record: TraderRuleExecution = {
          id: "exec-" + String(executions.length + 1),
          ruleId: args.data.ruleId,
          userId: args.data.userId,
          traderAlias: args.data.traderAlias,
          trigger: args.data.trigger,
          eventSide: args.data.eventSide,
          eventQuantity: args.data.eventQuantity,
          eventPrice: args.data.eventPrice,
          sourceMessageId: args.data.sourceMessageId ?? null,
          chatId: args.data.chatId ?? null,
          alertStatus: args.data.alertStatus ?? "SKIPPED",
          followStatus: args.data.followStatus ?? "SKIPPED",
          followSide: args.data.followSide ?? null,
          followQuantity: args.data.followQuantity ?? null,
          followPrice: args.data.followPrice ?? null,
          outgoingMessageId: args.data.outgoingMessageId ?? null,
          errorMessage: args.data.errorMessage ?? null,
          executedAt: new Date(),
        };
        executions.push(record);
        return record;
      },
    },
  };

  const store = createTraderRuleStore(mockPrisma as unknown as PrismaClient);

  // 1. Create a rule
  const created = await store.createTraderRule("user-1", {
    traderAlias: "سناتور",
    trigger: "ORDER_PLACED",
    side: "BUY",
    minQuantity: 2,
    alertEnabled: true,
    followEnabled: true,
    followDirection: "DIRECT",
    followSizing: "FIXED",
    fixedQuantity: 1,
    maxQuantity: 2,
  });

  assert.equal(created.traderAlias, "سناتور");
  assert.equal(created.trigger, "ORDER_PLACED");
  assert.equal(created.status, "ENABLED");
  assert.equal(participants.has("سناتور"), true);

  // 2. List rules
  const list = await store.listTraderRules("user-1");
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, created.id);

  // 3. Toggle status
  const toggled = await store.toggleTraderRule(created.id, "user-1");
  assert.equal(toggled?.status, "DISABLED");

  // 4. Update rule
  const updated = await store.updateTraderRule(created.id, "user-1", {
    minQuantity: 3,
    status: "ENABLED",
  });
  assert.equal(updated?.minQuantity, 3);
  assert.equal(updated?.status, "ENABLED");

  // 5. Match rules
  const matched = await store.findMatchingTraderRules({
    traderAlias: "سناتور",
    trigger: "ORDER_PLACED",
    side: "BUY",
    quantity: 4,
  });
  assert.equal(matched.length, 1);

  // 6. Record execution
  const recorded = await store.recordTraderRuleExecution({
    ruleId: created.id,
    userId: "user-1",
    traderAlias: "سناتور",
    trigger: "ORDER_PLACED",
    eventSide: "BUY",
    eventQuantity: 4,
    eventPrice: 105000,
    sourceMessageId: 100,
    chatId: -100123,
    alertStatus: "SENT",
    followStatus: "SUBMITTED",
    followSide: "BUY",
    followQuantity: 1,
    followPrice: 105000,
    outgoingMessageId: 105,
  });
  assert.ok(recorded);
  assert.equal(recorded?.alertStatus, "SENT");
  assert.equal(recorded?.followStatus, "SUBMITTED");

  // 7. List executions
  const execHistory = await store.listTraderRuleExecutions("user-1");
  assert.equal(execHistory.length, 1);
  assert.equal(execHistory[0]?.ruleId, created.id);

  // 8. Delete rule
  const deleted = await store.deleteTraderRule(created.id, "user-1");
  assert.equal(deleted, true);
  const remaining = await store.listTraderRules("user-1");
  assert.equal(remaining.length, 0);
});
