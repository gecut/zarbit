import assert from "node:assert/strict";
import test from "node:test";

import { createQuoteRecorder } from "../src/quote";

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

test("passes the actual source timestamp to request matching", async () => {
  const announcedAt = new Date(Date.now() - 1000);
  let received: unknown;
  const record = createQuoteRecorder(
    {
      recordQuote: async () => ({ historyRecorded: true, latestUpdated: true }),
    },
    { groupId: -1001, senderId: "55" },
    async (quote) => {
      received = quote;
    },
  );
  await record("user-1", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 42,
    text: "مظنه: 96200",
    date: announcedAt,
  });
  assert.deepEqual(received, {
    compactQuote: 96200,
    sourceMessageId: 42,
    announcedAt,
  });
});
