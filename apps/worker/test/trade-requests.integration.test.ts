import assert from "node:assert/strict";
import test from "node:test";
import { createRequestExecutor } from "../src/requests";
import { createTradeRequestProcessor } from "../src/trade-request-processor";
import { createMarketIngestion } from "../src/market-ingestion";

const url = process.env.TEST_DATABASE_URL;
test(
  "receipt ingestion, durable processing and target-price delivery use real PostgreSQL",
  { skip: !url },
  async () => {
    const parsed = new URL(url!);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
        parsed.pathname.endsWith("_test"),
    );
    const { createPrismaClient, createStore } = await import("@zarbit/db");
    const db = createPrismaClient(url);
    let now = new Date("2026-09-15T10:00:00Z");
    const store = createStore(db, () => now);
    const groupId = -909001;
    const alias = `receipt-${crypto.randomUUID()}`;
    const user = await store.user({ telegramUserId: alias });
    await db.telegramSession.create({
      data: { userId: user.id, state: "ACTIVE", runtimeReady: true },
    });
    await store.initializeTradeRequests(groupId);
    const sent: string[] = [];
    const executor = createRequestExecutor(store, {
      ready: async () => {},
      group: async (_userId, text) => {
        sent.push(text);
        return 555;
      },
      private: async () => 556,
    });
    const processor = createTradeRequestProcessor(store, executor, groupId);
    try {
      const row = await store.createRequest(user.id, {
        action: "BUY",
        condition: "LTE",
        targetPrice: 100000,
        units: 2,
      });
      // Request creation fences message IDs across the single configured group.
      now = new Date(now.getTime() + 1000);
      const messageId = row.armedAfterMessageId + 1;
      const ingest = createMarketIngestion(
        store,
        { groupId, senderId: "55" },
        processor.wake,
      );
      const event = {
        chatId: groupId,
        senderId: "55",
        messageId,
        date: now,
        text: `🔵 خریدار : ${alias}-buyer\n🔴 فروشنده : ${alias}-seller\n✅ تعداد: 2 قیمت: 99٬990٬000 ✅\n⏱️ ساعت: 13:30:01 1405/06/24\n🔖 شماره حواله: 9368`,
      };
      await ingest(user.id, 1, { ...event, text: "مظنه: 99900" });
      assert.deepEqual(sent, []);
      await ingest(user.id, 1, { ...event, messageId: messageId + 1 });
      await ingest(user.id, 1, { ...event, messageId: messageId + 1 });
      for (
        let i = 0;
        i < 100 && (await store.request(user.id, row.id))?.status !== "DONE";
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.deepEqual(sent, ["2خ100000"]);
      const result = await store.request(user.id, row.id);
      assert.equal(result?.status, "DONE");
      assert.equal(result?.triggeredPrice, 99990);
      assert.equal(result?.outgoingMessageId, 555);
      assert.equal(result?.triggerSource, "TRADE");
      await store.recoverRequests();
      const second = await store.createRequest(user.id, {
        action: "SELL",
        condition: "GTE",
        targetPrice: 100000,
        units: 1,
      });
      now = new Date(now.getTime() + 1000);
      // No wakeup: the periodic durable scan must recover a committed receipt.
      await store.recordTrade({
        chatId: groupId,
        sourceMessageId: messageId + 2,
        compactPrice: 100010,
        quantity: 1,
        buyerAlias: `${alias}-buyer`,
        sellerAlias: `${alias}-seller`,
        announcedAt: now,
      });
      for (
        let i = 0;
        i < 150 && (await store.request(user.id, second.id))?.status !== "DONE";
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal((await store.request(user.id, second.id))?.status, "DONE");
      await processor.stop();
      assert.deepEqual(sent, ["2خ100000", "1ف100000"]);
    } finally {
      await processor.stop();
      await db.request.deleteMany({ where: { userId: user.id } });
      await db.telegramSession.deleteMany({ where: { userId: user.id } });
      await db.telegramUser.delete({ where: { id: user.id } });
      await db.trade.deleteMany({ where: { chatId: BigInt(groupId) } });
      await db.quoteHistory.deleteMany({ where: { chatId: BigInt(groupId) } });
      await db.tradeRequestCursor.deleteMany({
        where: { chatId: BigInt(groupId) },
      });
      await db.participant.deleteMany({ where: { id: { startsWith: alias } } });
      await db.$disconnect();
    }
  },
);
