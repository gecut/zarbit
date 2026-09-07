import assert from "node:assert/strict";
import test from "node:test";

import { createPrismaClient, createStore } from "../src/index";

const prisma = createPrismaClient();
let currentTime = new Date("2026-09-07T12:00:00.000Z");
const store = createStore(prisma, () => currentTime);

async function clean() {
  await prisma.quoteHistory.deleteMany();
  await prisma.latestQuote.deleteMany();
  await prisma.telegramSession.deleteMany();
  await prisma.loginRateLimit.deleteMany();
  await prisma.telegramUser.deleteMany();
}

test.beforeEach(async () => {
  currentTime = new Date("2026-09-07T12:00:00.000Z");
  await clean();
});
test.after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("PostgreSQL records the first compact quote in history and latest", async () => {
  const announcedAt = new Date("2026-09-07T08:00:00.000Z");
  const recorded = await store.recordQuote({
    compactQuote: 95_900,
    announcedAt,
    receivedAt: new Date("2026-09-07T08:00:01.000Z"),
    sourceMessageId: 10,
  });

  assert.deepEqual(recorded, { historyRecorded: true, latestUpdated: true });
  const quote = await store.latestQuote();
  assert.equal(quote?.id, 1);
  assert.equal(quote?.compactQuote, 95_900);
  assert.equal(quote?.announcedAt.getTime(), announcedAt.getTime());
  assert.equal(quote?.sourceMessageId, 10);
  const history = await store.quotesSince(new Date("2026-09-04T12:00:00.000Z"));
  assert.equal(history.length, 1);
  assert.equal(history[0]?.compactQuote, 95_900);
});

test("PostgreSQL keeps a newer latest quote while retaining valid older history", async () => {
  await store.recordQuote({
    compactQuote: 96_000,
    announcedAt: new Date("2026-09-07T08:01:00.000Z"),
    receivedAt: new Date("2026-09-07T08:01:01.000Z"),
    sourceMessageId: 11,
  });

  assert.equal(
    await store.recordQuote({
      compactQuote: 95_000,
      announcedAt: new Date("2026-09-07T08:00:00.000Z"),
      receivedAt: new Date("2026-09-07T08:01:02.000Z"),
      sourceMessageId: 12,
    }),
    { historyRecorded: true, latestUpdated: false },
  );
  assert.equal(
    await store.recordQuote({
      compactQuote: 96_000,
      announcedAt: new Date("2026-09-07T08:01:00.000Z"),
      receivedAt: new Date("2026-09-07T08:01:03.000Z"),
      sourceMessageId: 11,
    }),
    { historyRecorded: false, latestUpdated: false },
  );

  const quote = await store.latestQuote();
  assert.equal(quote?.compactQuote, 96_000);
  assert.equal(quote?.sourceMessageId, 11);
  const history = await store.quotesSince(new Date("2026-09-04T12:00:00.000Z"));
  assert.equal(history.length, 2);
});

test("PostgreSQL removes expired history and retains an expired latest quote", async () => {
  await prisma.quoteHistory.create({
    data: {
      compactQuote: 94_000,
      announcedAt: new Date("2026-08-30T11:59:59.999Z"),
      receivedAt: new Date("2026-08-30T12:00:00.000Z"),
      sourceMessageId: 20,
    },
  });

  await store.recordQuote({
    compactQuote: 96_000,
    announcedAt: new Date("2026-09-07T11:00:00.000Z"),
    receivedAt: currentTime,
    sourceMessageId: 21,
  });
  const expired = await store.recordQuote({
    compactQuote: 95_000,
    announcedAt: new Date("2026-08-30T12:00:00.000Z"),
    receivedAt: currentTime,
    sourceMessageId: 22,
  });

  assert.deepEqual(expired, { historyRecorded: false, latestUpdated: false });
  const history = await prisma.quoteHistory.findMany({
    orderBy: { sourceMessageId: "asc" },
  });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.sourceMessageId, 21);
});

test("PostgreSQL can set a stale latest quote without retaining expired history", async () => {
  const recorded = await store.recordQuote({
    compactQuote: 95_000,
    announcedAt: new Date("2026-08-30T12:00:00.000Z"),
    receivedAt: currentTime,
    sourceMessageId: 30,
  });

  assert.deepEqual(recorded, { historyRecorded: false, latestUpdated: true });
  assert.equal((await store.latestQuote())?.compactQuote, 95_000);
  assert.equal(await prisma.quoteHistory.count(), 0);
});
