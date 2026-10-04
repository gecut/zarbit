import assert from "node:assert/strict";
import test from "node:test";

import type { Store } from "@zarbit/db";
import { createMarketIngestion as createQuoteRecorder } from "../src/market-ingestion";

test("records only recognized quotes from the configured group publisher", async () => {
  const events: Array<Record<string, unknown>> = [];
  const record = createQuoteRecorder(
    {
      recordQuote: async (input) => {
        events.push(input);
        return { historyRecorded: true, latestUpdated: true };
      },
    },
    { groupId: -1001, senderId: "55" },
  );

  await record("user-1", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 9,
    text: "مظنه: ۹۵۹۰۰",
    date: new Date("2026-09-07T08:00:00.000Z"),
  });
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "wrong",
    messageId: 10,
    text: "95900",
    date: new Date(),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.compactQuote, 95_900);
  assert.equal(events[0]?.sourceMessageId, 9);
  assert.equal(
    (events[0]?.announcedAt as Date).toISOString(),
    "2026-09-07T08:00:00.000Z",
  );
});

test("does not record a malformed quote or a message from another source", async () => {
  const events: Array<Record<string, unknown>> = [];
  const record = createQuoteRecorder(
    {
      recordQuote: async (input) => {
        events.push(input);
        return { historyRecorded: true, latestUpdated: true };
      },
    },
    { groupId: -1001, senderId: "55" },
  );

  await record("user-1", 1, {
    chatId: -1002,
    senderId: "55",
    messageId: 10,
    text: "مظنه: 95900",
    date: new Date(),
  });
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 11,
    text: "مظنه 95900",
    date: new Date(),
  });

  assert.equal(events.length, 0);
});

test("official quotes never wake trade request processing", async () => {
  const announcedAt = new Date(Date.now() - 1000);
  let received: unknown;
  const record = createQuoteRecorder(
    {
      recordQuote: async () => ({ historyRecorded: true, latestUpdated: true }),
    },
    { groupId: -1001, senderId: "55" },
    () => {
      received = true;
    },
  );
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 42,
    text: "مظنه: 96200",
    date: announcedAt,
  });
  assert.equal(received, undefined);
});

test("only a committed authoritative receipt wakes trade processing", async () => {
  let wakeups = 0;
  let committed = false;
  let fail = false;
  const record = createQuoteRecorder(
    {
      recordQuote: async () => ({ historyRecorded: true, latestUpdated: true }),
      recordTrade: async () => {
        if (fail) throw new Error("database failure");
        const first = !committed;
        committed = true;
        return { tradeRecorded: first };
      },
    },
    { groupId: -1001, senderId: "55" },
    () => {
      assert.equal(committed, true);
      wakeups++;
    },
  );
  const event = {
    chatId: -1001,
    senderId: "55",
    messageId: 43,
    date: new Date(),
    text: "🔵 خریدار : خریدار تست\n🔴 فروشنده : فروشنده تست\n✅ تعداد: 2 قیمت: 99٬990٬000 ✅\n⏱️ ساعت: 15:18:50 1405/06/19\n🔖 شماره حواله: 9368",
  };
  await record("one", 1, { ...event, senderId: "wrong" });
  assert.equal(wakeups, 0);
  fail = true;
  await assert.rejects(record("one", 1, event));
  assert.equal(wakeups, 0);
  fail = false;
  await record("one", 1, event);
  await record("two", 1, event);
  assert.equal(wakeups, 1);
});

test("shorthand order resolves against closest predecessor quote even if quotes arrived out of order (FR-03)", async () => {
  const recordedQuotes: Array<{
    chatId: bigint;
    compactQuote: number;
    sourceMessageId: number;
    announcedAt: Date;
    receivedAt: Date;
    id: number;
  }> = [];
  const recordedActions: Array<{
    actionType: string;
    compactPrice: number | null;
    status: string;
    sourceMessageId: number;
  }> = [];

  const store: Partial<Store> = {
    recordQuote: async (input) => {
      recordedQuotes.push({
        id: recordedQuotes.length + 1,
        chatId: BigInt(input.chatId ?? -1001),
        compactQuote: input.compactQuote,
        sourceMessageId: input.sourceMessageId,
        announcedAt: input.announcedAt,
        receivedAt: input.receivedAt,
      });
      return { historyRecorded: true, latestUpdated: true };
    },
    quoteBeforeMessage: async (chatId, sourceMessageId) => {
      const candidates = recordedQuotes
        .filter(
          (q) =>
            q.chatId === BigInt(chatId) && q.sourceMessageId < sourceMessageId,
        )
        .sort((a, b) => b.sourceMessageId - a.sourceMessageId);
      const found = candidates[0];
      if (!found) return null;
      return {
        ...found,
        createdAt: found.receivedAt,
      };
    },
    recordTradingAction: async (input) => {
      recordedActions.push({
        actionType: input.actionType,
        compactPrice: input.compactPrice,
        status: input.status,
        sourceMessageId: input.sourceMessageId,
      });
      return {
        actionRecorded: true,
        actionId: "act-1",
        duplicate: false,
      };
    },
  };

  const record = createQuoteRecorder(store as Store, {
    groupId: -1001,
    senderId: "55",
  });

  // 1. Quote at message 20 arrives first (price: 102980)
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 20,
    text: "مظنه: 102980",
    date: new Date("2026-09-07T08:00:20.000Z"),
  });

  // 2. Quote at message 10 arrives out of order (price: 101980)
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 10,
    text: "مظنه: 101980",
    date: new Date("2026-09-07T08:00:10.000Z"),
  });

  // 3. User order at message 21 arrives with shorthand suffix "خ980"
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "trader-1",
    messageId: 21,
    text: "خ980",
    date: new Date("2026-09-07T08:00:21.000Z"),
  });

  assert.equal(recordedActions.length, 1);
  assert.equal(recordedActions[0]?.actionType, "ORDER_BUY");
  // Must match against message 20 (102980), NOT message 10 (101980)
  assert.equal(recordedActions[0]?.compactPrice, 102_980);
  assert.equal(recordedActions[0]?.status, "OBSERVED");
});

test("shorthand order fails closed as AMBIGUOUS when no predecessor quote exists (FR-07)", async () => {
  const recordedActions: Array<{
    actionType: string;
    compactPrice: number | null;
    status: string;
    sourceMessageId: number;
  }> = [];

  const store: Partial<Store> = {
    recordQuote: async () => ({ historyRecorded: true, latestUpdated: true }),
    quoteBeforeMessage: async () => null,
    recordTradingAction: async (input) => {
      recordedActions.push({
        actionType: input.actionType,
        compactPrice: input.compactPrice,
        status: input.status,
        sourceMessageId: input.sourceMessageId,
      });
      return {
        actionRecorded: true,
        actionId: "act-1",
        duplicate: false,
      };
    },
  };

  const record = createQuoteRecorder(store as Store, {
    groupId: -1001,
    senderId: "55",
  });

  // Order with shorthand suffix arrives without predecessor quote
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "trader-1",
    messageId: 21,
    text: "خ980",
    date: new Date("2026-09-07T08:00:21.000Z"),
  });

  assert.equal(recordedActions.length, 1);
  assert.equal(recordedActions[0]?.actionType, "ORDER_BUY");
  assert.equal(recordedActions[0]?.compactPrice, null);
  assert.equal(recordedActions[0]?.status, "AMBIGUOUS");
});
