import assert from "node:assert/strict";
import test from "node:test";

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
