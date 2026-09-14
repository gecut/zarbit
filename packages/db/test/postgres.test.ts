import assert from "node:assert/strict";
import test from "node:test";

import { createPrismaClient, createStore } from "../src/index";

const prisma = createPrismaClient();
let currentTime = new Date("2026-09-07T12:00:00.000Z");
const store = createStore(prisma, () => currentTime);

async function clean() {
  await prisma.quoteHistory.deleteMany();
  await prisma.request.deleteMany();
  await prisma.telegramOperation.deleteMany();
  await prisma.telegramSession.deleteMany();
  await prisma.loginRateLimit.deleteMany();
  await prisma.telegramUser.deleteMany();
  await prisma.tradingAction.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.participant.deleteMany();
}

test.beforeEach(async () => {
  currentTime = new Date("2026-09-07T12:00:00.000Z");
  await clean();
});
test.after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("relogin replaces a revoked legacy identity while preserving live session fences", async () => {
  const owner = await store.user({ telegramUserId: "legacy-relogin" });
  await prisma.telegramSession.create({
    data: {
      userId: owner.id,
      connectedTelegramUserId: "legacy-relogin",
      state: "ACTIVE",
    },
  });
  for (const state of [
    "ACTIVE",
    "NOT_IN_GROUP",
    "REVOKING",
    "ERROR",
  ] as const) {
    await prisma.telegramSession.update({
      where: { userId: owner.id },
      data: { state },
    });
    await assert.rejects(store.beginSession(owner.id, "new-storage"), {
      code: "SESSION_EXISTS",
    });
  }
  await prisma.telegramSession.update({
    where: { userId: owner.id },
    data: { state: "REVOKED", storageKey: null, revokedAt: currentTime },
  });
  const started = await store.beginSession(
    owner.id,
    "new-storage",
    crypto.randomUUID(),
  );
  assert.equal(started.state, "PENDING_OTP");
  assert.equal(started.connectedTelegramUserId, null);
  assert.equal(started.revokedAt, null);
  assert.equal(started.revision, 1);
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
  assert.equal(typeof quote?.id, "number");
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

  assert.deepEqual(
    await store.recordQuote({
      compactQuote: 95_000,
      announcedAt: new Date("2026-09-07T08:00:00.000Z"),
      receivedAt: new Date("2026-09-07T08:01:02.000Z"),
      sourceMessageId: 12,
    }),
    { historyRecorded: true, latestUpdated: false },
  );
  assert.deepEqual(
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

test("PostgreSQL permanently retains older quote history without pruning", async () => {
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
  const older = await store.recordQuote({
    compactQuote: 95_000,
    announcedAt: new Date("2026-08-30T12:00:00.000Z"),
    receivedAt: currentTime,
    sourceMessageId: 22,
  });

  assert.deepEqual(older, { historyRecorded: true, latestUpdated: false });
  const history = await prisma.quoteHistory.findMany({
    orderBy: { sourceMessageId: "asc" },
  });
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((row) => row.sourceMessageId),
    [20, 21, 22],
  );
  assert.equal((await store.latestQuote())?.sourceMessageId, 21);
});

test("PostgreSQL records older quotes on empty history and updates latest quote", async () => {
  const recorded = await store.recordQuote({
    compactQuote: 95_000,
    announcedAt: new Date("2026-08-30T12:00:00.000Z"),
    receivedAt: currentTime,
    sourceMessageId: 30,
  });

  assert.deepEqual(recorded, { historyRecorded: true, latestUpdated: true });
  assert.equal((await store.latestQuote())?.compactQuote, 95_000);
  assert.equal(await prisma.quoteHistory.count(), 1);
});

test("request recovery atomically returns only newly uncertain executions", async () => {
  const owner = await prisma.telegramUser.create({
    data: { telegramUserId: "recovery-test" },
  });
  const base = {
    userId: owner.id,
    condition: "GTE" as const,
    action: "ALERT" as const,
    targetPrice: 96155,
  };
  await prisma.request.createMany({
    data: [
      { ...base, id: "unclaimed", status: "ACTIVE" },
      { ...base, id: "running", status: "ACTIVE", claimToken: "claim-a" },
      { ...base, id: "finished", status: "DONE", claimToken: "claim-b" },
      { ...base, id: "uncertain", status: "UNKNOWN", claimToken: "claim-c" },
    ],
  });
  const [first, concurrent] = await Promise.all([
    store.recoverRequests(),
    store.recoverRequests(),
  ]);
  assert.deepEqual(
    [...first, ...concurrent].map((row) => row.id),
    ["running"],
  );
  assert.equal([...first, ...concurrent][0]?.status, "UNKNOWN");
  assert.deepEqual(await store.recoverRequests(), []);
  assert.equal(
    (await prisma.request.findUniqueOrThrow({ where: { id: "unclaimed" } }))
      .status,
    "ACTIVE",
  );
  assert.equal(
    (await prisma.request.findUniqueOrThrow({ where: { id: "finished" } }))
      .status,
    "DONE",
  );
});

test("operation admission serializes duplicate IDs and stores no credentials", async () => {
  const owner = await store.user({ telegramUserId: "operation-owner" });
  const input = {
    operationId: crypto.randomUUID(),
    command: { type: "login" as const, phone: "+989121234567" },
  };
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      store.acceptTelegramOperation(
        owner.id,
        input,
        "trace",
        currentTime.getTime() + 5000,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.created).length, 1);
  const rows = await prisma.telegramOperation.findMany();
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(rows).includes(input.command.phone), false);
  await assert.rejects(
    store.acceptTelegramOperation(
      owner.id,
      { operationId: crypto.randomUUID(), command: input.command },
      "trace",
      currentTime.getTime() + 5000,
    ),
    { code: "OPERATION_PENDING" },
  );
  await assert.rejects(
    store.acceptTelegramOperation(
      owner.id,
      { operationId: input.operationId, command: { type: "revoke" } },
      "trace",
      currentTime.getTime() + 5000,
    ),
    { code: "OPERATION_CONFLICT" },
  );
  assert.equal(
    await store.telegramOperation("another-owner", input.operationId),
    null,
  );
});

test("revoke and send share an atomic boundary and preserve actual sending outcomes", async () => {
  for (let i = 0; i < 12; i++) {
    const owner = await store.user({ telegramUserId: `race-${i}` });
    await prisma.telegramSession.create({
      data: {
        userId: owner.id,
        state: "ACTIVE",
        runtimeReady: true,
        connectedTelegramUserId: owner.telegramUserId,
      },
    });
    const row = await store.createRequest(owner.id, {
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96000,
      units: null,
    });
    await store.claimRequest(row.id, owner.id, `claim-${i}`);
    const input = {
      operationId: crypto.randomUUID(),
      command: { type: "revoke" as const },
    };
    const [sending, accepted] = await Promise.all([
      store.markSending(row.id, `claim-${i}`),
      store.acceptTelegramOperation(
        owner.id,
        input,
        "trace",
        currentTime.getTime() + 5000,
      ),
    ]);
    const final = await store.request(owner.id, row.id);
    assert.equal((await store.session(owner.id))?.state, "REVOKING");
    if (sending.count) {
      assert.equal(final?.executionPhase, "SENDING");
      assert.equal(accepted.operation.sendingRequests, 1);
      assert.equal(accepted.operation.cancelledRequests, 0);
      await store.completeRequest(row.id, `claim-${i}`, {
        status: "UNKNOWN",
        failureReason: "test timeout",
      });
      assert.equal((await store.request(owner.id, row.id))?.status, "UNKNOWN");
    } else {
      assert.equal(final?.status, "CANCELLED");
      assert.equal(final?.deliveryStartedAt, null);
      assert.equal(accepted.operation.cancelledRequests, 1);
    }
    assert.equal((await store.markSending(row.id, `claim-${i}`)).count, 0);
  }
});

test("manual cancellation works without Telegram and cannot cancel sending", async () => {
  const owner = await store.user({ telegramUserId: "offline-cancel" });
  const row = await prisma.request.create({
    data: {
      userId: owner.id,
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96000,
      executionPhase: "CLAIMED",
      claimToken: "claim",
    },
  });
  await assert.rejects(store.cancelRequest("other-owner", row.id));
  assert.equal(
    (await store.cancelRequest(owner.id, row.id)).status,
    "CANCELLED",
  );
  const sending = await prisma.request.create({
    data: {
      userId: owner.id,
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96000,
      executionPhase: "SENDING",
      deliveryStartedAt: currentTime,
    },
  });
  await assert.rejects(store.cancelRequest(owner.id, sending.id));
});

test("session fences reject stale activation and heartbeat preserves change time", async () => {
  const owner = await store.user({ telegramUserId: "generation" });
  const session = await store.beginSession(
    owner.id,
    "a".repeat(64),
    crypto.randomUUID(),
  );
  currentTime = new Date(currentTime.getTime() + 10000);
  await store.updateSession(owner.id, session.revision, {
    state: "PENDING_OTP",
    runtimeCheckedAt: currentTime,
  });
  assert.equal(
    (await store.session(owner.id))?.stateChangedAt.getTime(),
    session.stateChangedAt.getTime(),
  );
  await store.acceptTelegramOperation(
    owner.id,
    { operationId: crypto.randomUUID(), command: { type: "revoke" } },
    "trace",
    currentTime.getTime() + 5000,
  );
  assert.equal(
    (
      await store.activateSession(owner.id, session.revision, {
        state: "ACTIVE",
        runtimeReady: true,
      })
    ).count,
    0,
  );
  assert.equal(
    await store.disableSession(
      owner.id,
      "ERROR",
      "late failure",
      session.revision,
    ),
    false,
  );
  assert.equal((await store.session(owner.id))?.state, "REVOKING");
});

test("rate limit admission is atomic and longer Telegram bans never shrink", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      store.consumeSend(["user:one", "phone:one"], currentTime),
    ),
  );
  assert.equal(
    results.filter((r) => r.status === "fulfilled").length,
    3,
    String(results.find((r) => r.status === "rejected")?.reason),
  );
  const long = new Date(currentTime.getTime() + 3600000);
  await Promise.all([
    store.blockLogin(["user:one"], long),
    store.blockLogin(["user:one"], new Date(currentTime.getTime() + 60000)),
  ]);
  assert.equal(
    (
      await prisma.loginRateLimit.findUniqueOrThrow({
        where: { key: "user:one" },
      })
    ).blockedUntil?.getTime(),
    long.getTime(),
  );
});

test("restart interrupts credentials, preserves authorization, and retains cleanup intents", async () => {
  const owner = await store.user({ telegramUserId: "restart-pending" });
  const id = crypto.randomUUID();
  await store.acceptTelegramOperation(
    owner.id,
    { operationId: id, command: { type: "login", phone: "+989121234567" } },
    "trace",
    currentTime.getTime() + 5000,
  );
  await store.beginSession(owner.id, "a".repeat(64), id);
  const authorized = await store.user({ telegramUserId: "restart-authorized" });
  await prisma.telegramSession.create({
    data: {
      userId: authorized.id,
      state: "PENDING_OTP",
      storageKey: "b".repeat(64),
      connectedTelegramUserId: authorized.telegramUserId,
    },
  });
  await store.recover();
  await store.recoverTelegramOperations();
  assert.equal(
    (await store.telegramOperation(owner.id, id))?.status,
    "INTERRUPTED",
  );
  assert.equal((await store.session(owner.id))?.state, "REVOKING");
  assert.equal((await store.session(owner.id))?.storageKey, "a".repeat(64));
  assert.equal((await store.session(authorized.id))?.state, "ACTIVE");
  assert.equal(
    (await store.session(authorized.id))?.storageKey,
    "b".repeat(64),
  );
});

test("retention removes completed metadata after 24h and never drops pending cleanup", async () => {
  const owner = await store.user({ telegramUserId: "retention" });
  await prisma.telegramOperation.createMany({
    data: [
      {
        userId: owner.id,
        id: crypto.randomUUID(),
        type: "login",
        requestId: "trace",
        status: "FAILED",
        revision: 0,
        acceptedAt: currentTime,
        completedAt: currentTime,
      },
      {
        userId: owner.id,
        id: crypto.randomUUID(),
        type: "revoke",
        requestId: "trace",
        status: "ACCEPTED",
        revision: 0,
        acceptedAt: currentTime,
      },
    ],
  });
  currentTime = new Date(currentTime.getTime() + 86400001);
  assert.equal((await store.pruneTelegramOperations()).count, 1);
  assert.equal(
    (await prisma.telegramOperation.findFirstOrThrow()).type,
    "revoke",
  );
});
