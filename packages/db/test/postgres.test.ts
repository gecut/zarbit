import assert from "node:assert/strict";
import test from "node:test";

const dbUrl = process.env.DATABASE_URL;
const isDbTest = Boolean(
  dbUrl &&
  (() => {
    try {
      const u = new URL(dbUrl);
      return (
        ["127.0.0.1", "localhost"].includes(u.hostname) &&
        u.pathname.endsWith("_test")
      );
    } catch {
      return false;
    }
  })(),
);

if (!isDbTest) {
  test(
    "PostgreSQL integration tests require a local database ending in _test",
    { skip: true },
    () => {},
  );
} else {
  const { createPrismaClient, createStore } = await import("../src/index");
  const prisma = createPrismaClient();
  let currentTime = new Date("2026-09-07T12:00:00.000Z");
  const store = createStore(prisma, () => currentTime);

  async function clean() {
    await prisma.tradeRequestCursor.deleteMany();
    await prisma.quoteHistory.deleteMany();
    await prisma.requestCreationIdentity.deleteMany();
    await prisma.request.deleteMany();
    await prisma.telegramOperation.deleteMany();
    await prisma.telegramSession.deleteMany();
    await prisma.loginRateLimit.deleteMany();
    await prisma.telegramUser.deleteMany();
    await prisma.tradingAction.deleteMany();
    await prisma.trade.deleteMany();
    await prisma.settlement.deleteMany();
    await prisma.financialInbox.deleteMany();
    await prisma.groupIngestionState.deleteMany();
    await prisma.participant.deleteMany();
  }

  test("bootstrap and reviewed settlement close both sides exactly once", async () => {
    const chatId = -1001n;
    const announcedAt = new Date("2026-09-07T08:00:00.000Z");
    const bootstrap = await store.recordSettlement({
      chatId,
      sourceMessageId: 10,
      senderId: "55",
      compactPrice: 100_000,
      announcedAt,
      payloadHash: "a".repeat(64),
      rawText: "test bootstrap",
    });
    assert.equal(bootstrap?.isBootstrap, true);
    await store.beginFinancialRecovery(chatId);
    await assert.rejects(
      store.applySettlement(chatId, 10),
      /history recovery is incomplete/,
    );
    await store.completeFinancialRecovery(chatId);
    await store.applySettlement(chatId, 10);
    assert.equal(await prisma.trade.count(), 0);

    for (const [sourceMessageId, buyerAlias, sellerAlias] of [
      [11, "long", "short"],
      [12, "long", "short"],
    ] as const) {
      const payloadHash = sourceMessageId.toString(16).padStart(64, "0");
      await store.observeFinancialMessage({
        chatId,
        sourceMessageId,
        senderId: "55",
        rawText: `test receipt ${sourceMessageId}`,
        eventKind: "NEW",
        payloadHash,
      });
      assert.equal(
        (
          await store.recordTrade({
            chatId,
            sourceMessageId,
            buyerAlias,
            sellerAlias,
            quantity: 1,
            compactPrice: 100_000,
            rawPrice: 100_000_000n,
            announcedAt,
          })
        )?.tradeRecorded,
        true,
      );
      await store.completeFinancialMessage(
        chatId,
        sourceMessageId,
        payloadHash,
      );
    }
    await store.recordSettlement({
      chatId,
      sourceMessageId: 20,
      senderId: "55",
      compactPrice: 102_980,
      announcedAt,
      payloadHash: "b".repeat(64),
      rawText: "test settlement",
    });
    await store.markHistoryScanned(chatId, 20);
    const evidence = await store.coverageEvidence(chatId, 10, 20);
    assert.equal(evidence.unresolvedCount, 0);
    await store.applySettlement(chatId, 20, {
      coverageDigest: evidence.digest,
      reviewedBy: "integration-test",
    });
    await store.applySettlement(chatId, 20, {
      coverageDigest: evidence.digest,
      reviewedBy: "integration-test",
    });
    const synthetic = await prisma.trade.findMany({
      where: { type: "SETTLEMENT" },
    });
    assert.equal(synthetic.length, 2);
    assert.deepEqual(
      synthetic
        .map((trade) => [
          trade.quantity,
          trade.compactPrice,
          trade.buyerParticipantId,
          trade.sellerParticipantId,
        ])
        .sort((a, b) =>
          String(a[2] ?? a[3]).localeCompare(String(b[2] ?? b[3])),
        ),
      [
        [2, 102_980, null, "long"],
        [2, 102_980, "short", null],
      ],
    );
    assert.equal((await store.latestTrade(chatId))?.sourceMessageId, 12);
    await assert.rejects(
      prisma.trade.create({
        data: {
          chatId,
          type: "SETTLEMENT",
          settlementMessageId: 20,
          buyerParticipantId: null,
          sellerParticipantId: "long",
          quantity: 2,
          compactPrice: 102_980,
          rawPrice: 102_980_000n,
          announcedAt,
        },
      }),
    );

    await store.recordSettlement({
      chatId,
      sourceMessageId: 30,
      senderId: "55",
      compactPrice: 103_000,
      announcedAt,
      payloadHash: "c".repeat(64),
      rawText: "test zero position",
    });
    await store.markHistoryScanned(chatId, 30);
    const emptyEvidence = await store.coverageEvidence(chatId, 20, 30);
    await store.applySettlement(chatId, 30, {
      coverageDigest: emptyEvidence.digest,
      reviewedBy: "integration-test",
    });
    assert.equal(
      await prisma.trade.count({ where: { type: "SETTLEMENT" } }),
      2,
    );

    await store.observeFinancialMessage({
      chatId,
      sourceMessageId: 15,
      senderId: "55",
      rawText: "late receipt",
      eventKind: "NEW",
      payloadHash: "d".repeat(64),
    });
    assert.equal(
      (
        await store.recordTrade({
          chatId,
          sourceMessageId: 15,
          buyerAlias: "long",
          sellerAlias: "short",
          quantity: 1,
          compactPrice: 101_000,
          rawPrice: 101_000_000n,
          announcedAt,
        })
      )?.tradeRecorded,
      false,
    );
    assert.equal(
      (await store.ingestionState(chatId))?.gateStatus,
      "REVIEW_REQUIRED",
    );
    assert.equal(await prisma.trade.count(), 4);
  });

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
    const history = await store.quotesSince(
      new Date("2026-09-04T12:00:00.000Z"),
    );
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
    const history = await store.quotesSince(
      new Date("2026-09-04T12:00:00.000Z"),
    );
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
        {
          ...base,
          id: "running",
          status: "ACTIVE",
          claimToken: "claim-a",
          executionPhase: "SENDING",
          deliveryStartedAt: currentTime,
        },
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
        creationKey: crypto.randomUUID(),
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
        assert.equal(
          (await store.request(owner.id, row.id))?.status,
          "UNKNOWN",
        );
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
    const authorized = await store.user({
      telegramUserId: "restart-authorized",
    });
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

  async function tradeRequest(
    action: "BUY" | "SELL" | "ALERT" = "BUY",
    condition: "LTE" | "GTE" = "LTE",
  ) {
    const owner = await store.user({
      telegramUserId: `trade-user-${crypto.randomUUID()}`,
    });
    await prisma.telegramSession.create({
      data: { userId: owner.id, state: "ACTIVE", runtimeReady: true },
    });
    const row = await store.createRequest(owner.id, {
      action,
      condition,
      targetPrice: 100000,
      units: action === "ALERT" ? null : 2,
      creationKey: crypto.randomUUID(),
    });
    return row;
  }
  async function receipt(
    sourceMessageId: number,
    compactPrice = 99990,
    announcedAt = currentTime,
  ) {
    return store.recordTrade({
      chatId: -1001,
      sourceMessageId,
      compactPrice,
      quantity: 1,
      buyerAlias: "test-buyer",
      sellerAlias: "test-seller",
      announcedAt,
    });
  }
  function advance(ms = 1000) {
    currentTime = new Date(currentTime.getTime() + ms);
  }

  test("trade matching claims all actions once and preserves target prices", async () => {
    await store.initializeTradeRequests(-1001);
    const rows = await Promise.all([
      tradeRequest("BUY"),
      tradeRequest("SELL"),
      tradeRequest("ALERT"),
    ]);
    advance();
    await Promise.all(Array.from({ length: 5 }, () => receipt(1)));
    await Promise.all(
      Array.from({ length: 5 }, () => store.claimTradeRequests(-1001)),
    );
    const pending = await store.pendingTradeRequests();
    assert.equal(pending.length, 3);
    for (const row of pending) {
      assert.equal(row.targetPrice, 100000);
      assert.equal(row.triggeredPrice, 99990);
      assert.equal(row.triggerSource, "TRADE");
      assert.equal(row.triggeredMessageId, 1);
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          store.markSending(row.id, row.claimToken!),
        ),
      );
      assert.equal(attempts.filter((attempt) => attempt.count).length, 1);
    }
    assert.equal(await prisma.trade.count(), 1);
    assert.equal(rows.length, 3);
  });

  test("trade freshness includes exactly 60 seconds and rejects older or future receipts", async () => {
    await store.initializeTradeRequests(-1001);
    const row = await tradeRequest();
    advance(120000);
    for (const [id, age, expected] of [
      [1, 60001, 0],
      [2, -1, 0],
      [3, 60000, 1],
    ] as const) {
      await receipt(id, 100000, new Date(currentTime.getTime() - age));
      await store.claimTradeRequests(-1001);
      assert.equal((await store.pendingTradeRequests()).length, expected);
    }
    const claimed = await store.request(row.userId, row.id);
    advance(1);
    assert.equal(
      (await store.markSending(row.id, claimed!.claimToken!)).count,
      0,
    );
    assert.equal(
      (await store.request(row.userId, row.id))?.executionPhase,
      "WAITING_TRADE",
    );
  });

  test("creation and editing fence existing, same-second and delayed historical trades", async () => {
    await store.initializeTradeRequests(-1001);
    await receipt(1);
    const row = await tradeRequest();
    await store.claimTradeRequests(-1001);
    assert.equal((await store.pendingTradeRequests()).length, 0);
    await receipt(2); // Same Telegram second as creation.
    await store.claimTradeRequests(-1001);
    assert.equal((await store.pendingTradeRequests()).length, 0);
    advance();
    await store.editRequest(row.userId, row.id, {
      action: "BUY",
      condition: "LTE",
      targetPrice: 100000,
      units: 2,
    });
    await receipt(3, 99990, new Date(currentTime.getTime() - 1000));
    await store.claimTradeRequests(-1001);
    assert.equal((await store.pendingTradeRequests()).length, 0);
    advance();
    await receipt(4);
    await store.claimTradeRequests(-1001);
    assert.equal((await store.pendingTradeRequests()).length, 1);
  });

  test("newest message wins over timestamps and older receipts cannot regress matching or snapshot", async () => {
    await store.initializeTradeRequests(-1001);
    await tradeRequest();
    advance(3000);
    await receipt(10, 100010, new Date(currentTime.getTime() - 1000));
    await receipt(9, 99990, currentTime);
    await store.claimTradeRequests(-1001);
    assert.equal((await store.pendingTradeRequests()).length, 0);
    assert.equal(
      (await store.marketHeads()).recentTrades[0]?.sourceMessageId,
      10,
    );
    assert.equal((await store.latestTrade(-1001))?.sourceMessageId, 10);
  });

  test("send revalidates latest price and returns invalid claims to waiting", async () => {
    await store.initializeTradeRequests(-1001);
    const row = await tradeRequest();
    advance();
    await receipt(1);
    await store.claimTradeRequests(-1001);
    const first = (await store.pendingTradeRequests())[0]!;
    advance();
    await receipt(2, 100010);
    assert.equal((await store.markSending(row.id, first.claimToken!)).count, 0);
    assert.equal((await store.request(row.userId, row.id))?.claimToken, null);
    advance();
    await receipt(3, 99980);
    await store.claimTradeRequests(-1001);
    const next = (await store.pendingTradeRequests())[0]!;
    advance();
    await receipt(4, 99970);
    const sending = await store.markSending(row.id, next.claimToken!);
    assert.equal(sending.row?.triggeredPrice, 99970);
    assert.equal(sending.row?.triggeredMessageId, 4);
    assert.equal(sending.row?.targetPrice, 100000);
  });

  test("restart recovers persisted trades and unsent claims but never retries ambiguous sends", async () => {
    await store.initializeTradeRequests(-1001);
    const row = await tradeRequest();
    advance();
    await receipt(1); // Process stops before matching.
    const restarted = createStore(prisma, () => currentTime);
    await restarted.initializeTradeRequests(-1001);
    await restarted.recoverRequests();
    await restarted.claimTradeRequests(-1001);
    const claimed = (await restarted.pendingTradeRequests())[0]!;
    assert.equal(claimed.id, row.id);
    assert.deepEqual(await restarted.recoverRequests(), []); // Stops after claiming, before send.
    assert.equal(
      (await restarted.pendingTradeRequests())[0]?.claimToken,
      claimed.claimToken,
    );
    await restarted.markSending(row.id, claimed.claimToken!);
    assert.equal((await restarted.recoverRequests())[0]?.status, "UNKNOWN"); // Send may have happened.
    await restarted.claimTradeRequests(-1001);
    assert.equal((await restarted.pendingTradeRequests()).length, 0);
    assert.equal(
      (await restarted.markSending(row.id, claimed.claimToken!)).count,
      0,
    );
  });

  test("cancel and manual execution compete safely with automatic claiming", async () => {
    await store.initializeTradeRequests(-1001);
    const row = await tradeRequest();
    advance();
    await receipt(1);
    await Promise.all([
      store.claimTradeRequests(-1001),
      store.claimRequest(row.id, row.userId, "manual-token"),
    ]);
    const claimed = await store.request(row.userId, row.id);
    assert.ok(claimed?.claimToken);
    const results = await Promise.allSettled([
      store.cancelRequest(row.userId, row.id),
      store.markSending(row.id, claimed.claimToken),
    ]);
    const final = await store.request(row.userId, row.id);
    assert.ok(
      final?.status === "CANCELLED" || final?.executionPhase === "SENDING",
    );
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length >= 1,
      true,
    );
    assert.equal(
      (await store.markSending(row.id, claimed.claimToken)).count,
      0,
    );
  });

  test("claim and cursor update roll back together on a database failure", async () => {
    await store.initializeTradeRequests(-1001);
    await tradeRequest();
    advance();
    await receipt(1);
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION fail_trade_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cursor failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_cursor_failure BEFORE UPDATE ON "TradeRequestCursor" FOR EACH ROW EXECUTE FUNCTION fail_trade_cursor()`,
    );
    try {
      await assert.rejects(store.claimTradeRequests(-1001));
      assert.equal((await store.pendingTradeRequests()).length, 0);
      assert.equal(
        (
          await prisma.tradeRequestCursor.findUniqueOrThrow({
            where: { chatId: -1001n },
          })
        ).sourceMessageId,
        0,
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER test_cursor_failure ON "TradeRequestCursor"',
      );
      await prisma.$executeRawUnsafe("DROP FUNCTION fail_trade_cursor()");
    }
    await store.claimTradeRequests(-1001);
    assert.equal((await store.pendingTradeRequests()).length, 1);
  });
}
