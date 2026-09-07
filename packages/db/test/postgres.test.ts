import assert from "node:assert/strict";
import test from "node:test";

import { createPrismaClient, createStore } from "../src/index";

const prisma = createPrismaClient();
const store = createStore(prisma);

async function clean() {
  await prisma.latestQuote.deleteMany();
  await prisma.telegramSession.deleteMany();
  await prisma.loginRateLimit.deleteMany();
  await prisma.telegramUser.deleteMany();
}

test.beforeEach(clean);
test.after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("PostgreSQL records the first compact quote", async () => {
  const announcedAt = new Date("2026-09-07T08:00:00.000Z");
  const recorded = await store.recordLatestQuote({
    compactQuote: 95_900,
    announcedAt,
    receivedAt: new Date("2026-09-07T08:00:01.000Z"),
    sourceMessageId: 10,
  });

  assert.equal(recorded, true);
  const quote = await store.latestQuote();
  assert.equal(quote?.id, 1);
  assert.equal(quote?.compactQuote, 95_900);
  assert.equal(quote?.announcedAt.getTime(), announcedAt.getTime());
  assert.equal(quote?.sourceMessageId, 10);
});

test("PostgreSQL keeps a newer quote when older or duplicate events arrive", async () => {
  await store.recordLatestQuote({
    compactQuote: 96_000,
    announcedAt: new Date("2026-09-07T08:01:00.000Z"),
    receivedAt: new Date("2026-09-07T08:01:01.000Z"),
    sourceMessageId: 11,
  });

  assert.equal(
    await store.recordLatestQuote({
      compactQuote: 95_000,
      announcedAt: new Date("2026-09-07T08:00:00.000Z"),
      receivedAt: new Date("2026-09-07T08:01:02.000Z"),
      sourceMessageId: 12,
    }),
    false,
  );
  assert.equal(
    await store.recordLatestQuote({
      compactQuote: 96_000,
      announcedAt: new Date("2026-09-07T08:01:00.000Z"),
      receivedAt: new Date("2026-09-07T08:01:03.000Z"),
      sourceMessageId: 11,
    }),
    false,
  );

  const quote = await store.latestQuote();
  assert.equal(quote?.compactQuote, 96_000);
  assert.equal(quote?.sourceMessageId, 11);
});
