import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createFinancialIngestionCoordinator } from "../src/financial-ingestion-coordinator";

test("missing snapshot head leaves recovery closed and the cursor unchanged", async () => {
  const steps: string[] = [];
  const store = {
    beginFinancialRecovery: async () => {
      steps.push("closed");
    },
    ingestionState: async () => ({ scannedThroughMessageId: 10 }),
    markHistoryScanned: async () => {
      steps.push("advanced");
    },
    completeFinancialRecovery: async () => {
      steps.push("opened");
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const sessions = {
    latestMessageId: async () => 12,
    history: async () => [],
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[1];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    sessions,
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementSenderId: "77",
      settlementEnabled: true,
    },
    async () => undefined,
  );
  await assert.rejects(
    coordinator.recover("session-a", 1),
    /snapshot head is unavailable/,
  );
  assert.deepEqual(steps, ["closed", "closed"]);
});

test("malformed receipt from a separate receipt bot persists for review", async () => {
  const steps: string[] = [];
  const store = {
    observeFinancialMessage: async () => {
      steps.push("observe");
    },
    flagFinancialReview: async () => {
      steps.push("review");
    },
    ingestionState: async () => null,
    financialObservationFlagged: async () => true,
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    {} as Parameters<typeof createFinancialIngestionCoordinator>[1],
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementSenderId: "77",
      settlementEnabled: false,
    },
    async () => {
      steps.push("ingest");
    },
  );
  await coordinator.onMessage("session-a", 1, {
    chatId: -1001,
    senderId: "55",
    messageId: 11,
    text: "🔵 خریدار : تست\n🔖 شماره حواله: 1",
    date: new Date(),
  });
  assert.deepEqual(steps, ["observe", "review"]);
});

test("recovery guard stays closed until pending interval reconciliation completes", async () => {
  const steps: string[] = [];
  const announcement = {
    chatId: -1001,
    senderId: "77",
    messageId: 20,
    text: "fixture announcement",
    date: new Date(),
  };
  const store = {
    beginFinancialRecovery: async () => {
      steps.push("closed");
    },
    completeFinancialRecovery: async () => {
      steps.push("ready");
    },
    pendingSettlements: async () => [
      {
        chatId: -1001n,
        sourceMessageId: 20,
        senderId: "77",
        payloadHash: createHash("sha256")
          .update(announcement.text)
          .digest("hex"),
        isBootstrap: false,
        status: "RECEIVED",
        reviewReason: null,
      },
    ],
    appliedSettlements: async () => [],
    unprocessedFinancialMessages: async () => [],
    ingestionState: async () => ({
      appliedThroughMessageId: 10,
      scannedThroughMessageId: 30,
    }),
    financialMessagesInInterval: async () => [
      { sourceMessageId: 11, payloadHash: "a".repeat(64), senderId: "55" },
    ],
    observeFinancialMessage: async ({ eventKind }: { eventKind: string }) => {
      steps.push(eventKind);
    },
    markHistoryScanned: async () => {
      steps.push("scan");
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    {
      latestMessageId: async () => 30,
      history: async (after: number) => (after === 19 ? [announcement] : []),
    } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[1],
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementSenderId: "77",
      settlementEnabled: true,
    },
    async () => undefined,
  );
  await coordinator.recover("session-a", 1);
  assert.deepEqual(steps, ["closed", "DELETE", "scan", "ready"]);
});

test("recovery scans unseen messages before advancing the durable history cursor", async () => {
  const steps: string[] = [];
  const store = {
    beginFinancialRecovery: async () => {
      steps.push("begin");
    },
    completeFinancialRecovery: async () => {
      steps.push("ready");
    },
    ingestionState: async () => ({
      scannedThroughMessageId: 10,
      appliedThroughMessageId: 0,
    }),
    pendingSettlements: async () => [],
    appliedSettlements: async () => [],
    unprocessedFinancialMessages: async () => [],
    observeFinancialMessage: async () => {
      steps.push("observe");
    },
    financialObservationFlagged: async () => false,
    completeFinancialMessage: async () => {
      steps.push("complete");
    },
    markHistoryScanned: async (_chat: number, id: number) => {
      steps.push(`scan:${id}`);
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const sessions = {
    latestMessageId: async () => 12,
    history: async (after: number, before: number) => {
      assert.equal(after, 10);
      assert.equal(before, 13);
      return [
        {
          chatId: -1001,
          senderId: "55",
          messageId: 11,
          text: "🔵 خریدار : خریدار تست\n🔴 فروشنده : فروشنده تست\n✅ تعداد: 2 قیمت: 99٬990٬000 ✅\n⏱️ ساعت: 15:18:50 1405/06/19\n🔖 شماره حواله: 9368",
          date: new Date(),
        },
        {
          chatId: -1001,
          senderId: "42",
          messageId: 12,
          text: "other message",
          date: new Date(),
        },
      ];
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[1];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    sessions,
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementSenderId: "77",
      settlementEnabled: true,
    },
    async () => {
      steps.push("ingest");
    },
  );
  await coordinator.recover("session-a", 1);
  assert.deepEqual(steps, [
    "begin",
    "observe",
    "ingest",
    "complete",
    "scan:12",
    "ready",
  ]);
});

test("different MTProto sessions share one ordered financial processing queue", async () => {
  const steps: string[] = [];
  const store = {
    observeFinancialMessage: async ({
      sourceMessageId,
    }: {
      sourceMessageId: number;
    }) => {
      steps.push(`observe:${sourceMessageId}`);
    },
    ingestionState: async () => null,
    financialObservationFlagged: async () => false,
    completeFinancialMessage: async (
      _chat: number,
      sourceMessageId: number,
    ) => {
      steps.push(`complete:${sourceMessageId}`);
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const sessions = { history: async () => [] } as unknown as Parameters<
    typeof createFinancialIngestionCoordinator
  >[1];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    sessions,
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementEnabled: false,
    },
    async (_userId, _revision, event) => {
      steps.push(`start:${event.messageId}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      steps.push(`end:${event.messageId}`);
    },
  );
  const receipt = (reference: number) =>
    `🔵 خریدار : خریدار تست\n🔴 فروشنده : فروشنده تست\n✅ تعداد: 2 قیمت: 99٬990٬000 ✅\n⏱️ ساعت: 15:18:50 1405/06/19\n🔖 شماره حواله: ${reference}`;
  await Promise.all([
    coordinator.onMessage("session-a", 1, {
      chatId: -1001,
      senderId: "55",
      messageId: 11,
      text: receipt(11),
      date: new Date(),
    }),
    coordinator.onMessage("session-b", 1, {
      chatId: -1001,
      senderId: "55",
      messageId: 12,
      text: receipt(12),
      date: new Date(),
    }),
  ]);
  assert.deepEqual(steps, [
    "observe:11",
    "start:11",
    "end:11",
    "complete:11",
    "observe:12",
    "start:12",
    "end:12",
    "complete:12",
  ]);
});

test("known edited financial messages are observed without replaying them", async () => {
  const kinds: string[] = [];
  const store = {
    financialMessageKnown: async () => true,
    observeFinancialMessage: async ({ eventKind }: { eventKind: string }) => {
      kinds.push(eventKind);
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const sessions = { history: async () => [] } as unknown as Parameters<
    typeof createFinancialIngestionCoordinator
  >[1];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    sessions,
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementEnabled: false,
    },
    async () => {
      throw new Error("Edit must not replay trading effects");
    },
  );
  await coordinator.onMutation({
    kind: "EDIT",
    event: {
      chatId: -1001,
      senderId: "55",
      messageId: 11,
      text: "corrected",
      date: new Date(),
    },
  });
  await coordinator.onMutation({
    kind: "DELETE",
    chatId: -1001,
    messageId: 11,
  });
  assert.deepEqual(kinds, ["EDIT", "DELETE"]);
});

test("restart replays a durable unprocessed receipt from Telegram history", async () => {
  const processed: number[] = [];
  const text =
    "🔵 خریدار : خریدار تست\n🔴 فروشنده : فروشنده تست\n✅ تعداد: 2 قیمت: 99٬990٬000 ✅\n⏱️ ساعت: 15:18:50 1405/06/19\n🔖 شماره حواله: 9368";
  const payloadHash = (await import("node:crypto"))
    .createHash("sha256")
    .update(text)
    .digest("hex");
  const event = {
    chatId: -1001,
    senderId: "55",
    messageId: 11,
    text,
    date: new Date("2026-09-07T08:00:00Z"),
  };
  const store = {
    pendingSettlements: async () => [],
    unprocessedFinancialMessages: async () => [
      { sourceMessageId: 11, senderId: "55", payloadHash },
    ],
    observeFinancialMessage: async () => undefined,
    ingestionState: async () => null,
    financialObservationFlagged: async () => false,
    completeFinancialMessage: async () => undefined,
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const sessions = { history: async () => [event] } as unknown as Parameters<
    typeof createFinancialIngestionCoordinator
  >[1];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    sessions,
    { groupId: -1001, quoteSenderId: "55", settlementEnabled: false },
    async (_userId, _revision, observed) => {
      processed.push(observed.messageId);
    },
  );
  await coordinator.recover("session-a", 1);
  assert.deepEqual(processed, [11]);
});

test("regular settlement is applied automatically when interval coverage is verified", async () => {
  const applied: {
    chatId: number;
    messageId: number;
    review?: { coverageDigest: string; reviewedBy: string };
  }[] = [];
  const announcement = {
    chatId: -1001,
    senderId: "77",
    messageId: 50,
    text: "fixture announcement",
    date: new Date(),
  };
  const store = {
    beginFinancialRecovery: async () => {},
    completeFinancialRecovery: async () => true,
    pendingSettlements: async () => [
      {
        chatId: -1001n,
        sourceMessageId: 50,
        senderId: "77",
        payloadHash: createHash("sha256")
          .update(announcement.text)
          .digest("hex"),
        isBootstrap: false,
        status: "RECEIVED",
        reviewReason: null,
      },
    ],
    appliedSettlements: async () => [],
    unprocessedFinancialMessages: async () => [],
    ingestionState: async () => ({
      appliedThroughMessageId: 10,
      scannedThroughMessageId: 60,
    }),
    markHistoryScanned: async () => {},
    coverageEvidence: async (_chat: number, after: number, before: number) => ({
      digest: `digest:${after}:${before}`,
      observationCount: 10,
      tradeCount: 10,
      unresolvedCount: 0,
    }),
    applySettlement: async (
      chatId: number,
      messageId: number,
      review?: { coverageDigest: string; reviewedBy: string },
    ) => {
      applied.push({ chatId, messageId, review });
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];
  const coordinator = createFinancialIngestionCoordinator(
    store,
    {
      latestMessageId: async () => 60,
      history: async () => [announcement],
    } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[1],
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementSenderId: "77",
      settlementEnabled: true,
    },
    async () => undefined,
  );
  await coordinator.recover("session-a", 1);
  assert.equal(applied.length, 1);
  assert.equal(applied[0]?.messageId, 50);
  assert.equal(applied[0]?.review?.reviewedBy, "SYSTEM_AUTOMATION");
  assert.equal(applied[0]?.review?.coverageDigest, "digest:10:50");
});

test("recovery chunks large historical gaps into bounded intervals", async () => {
  const historyCalls: Array<{ after: number; before: number }> = [];
  const scannedMarks: number[] = [];
  const store = {
    beginFinancialRecovery: async () => {},
    completeFinancialRecovery: async () => true,
    pendingSettlements: async () => [],
    appliedSettlements: async () => [],
    unprocessedFinancialMessages: async () => [],
    ingestionState: async () => ({
      appliedThroughMessageId: 0,
      scannedThroughMessageId: 100,
    }),
    markHistoryScanned: async (_group: number, mark: number) => {
      scannedMarks.push(mark);
    },
  } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[0];

  const coordinator = createFinancialIngestionCoordinator(
    store,
    {
      latestMessageId: async () => 550,
      history: async (after: number, before: number) => {
        historyCalls.push({ after, before });
        return [
          {
            chatId: -1001,
            messageId: before - 1,
            text: "msg",
            date: new Date(),
            senderId: "99",
          },
        ];
      },
    } as unknown as Parameters<typeof createFinancialIngestionCoordinator>[1],
    {
      groupId: -1001,
      quoteSenderId: "55",
      settlementSenderId: "77",
      settlementEnabled: true,
    },
    async () => undefined,
  );

  await coordinator.recover("session-a", 1);

  assert.equal(historyCalls.length, 3);
  assert.deepEqual(historyCalls[0], { after: 100, before: 301 });
  assert.deepEqual(historyCalls[1], { after: 300, before: 501 });
  assert.deepEqual(historyCalls[2], { after: 500, before: 551 });
  assert.deepEqual(scannedMarks, [300, 500, 550]);
});
