/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RpcClient } from "@zarbit/contracts/rpc";
import { createApp } from "../src/app/create-app";
import type { AppDependencies } from "../src/app-dependencies";

function fixture(
  includeSettlement = false,
  includeSelfTrade = false,
  includeBaseline = false,
) {
  const mockTrades = [
    {
      id: "t-1",
      chatId: 100n,
      sourceMessageId: 101,
      settlementMessageId: null,
      type: "NORMAL" as const,
      referenceNumber: "1001",
      buyerParticipantId: "اسکان",
      sellerParticipantId: "مرداد",
      quantity: 2,
      compactPrice: 105000,
      rawPrice: 105000000n,
      receiptTimeText: null,
      announcedAt: new Date("2026-09-08T10:00:00Z"),
      createdAt: new Date("2026-09-08T10:00:00Z"),
    },
    {
      id: "t-2",
      chatId: 100n,
      sourceMessageId: 102,
      settlementMessageId: null,
      type: "NORMAL" as const,
      referenceNumber: "1002",
      buyerParticipantId: "عرفاان",
      sellerParticipantId: "اسکان",
      quantity: 1,
      compactPrice: 105200,
      rawPrice: 105200000n,
      receiptTimeText: null,
      announcedAt: new Date("2026-09-09T10:00:00Z"),
      createdAt: new Date("2026-09-09T10:00:00Z"),
    },
  ];
  if (includeSelfTrade)
    mockTrades.push({
      ...mockTrades[0]!,
      id: "self-1",
      sourceMessageId: 104,
      buyerParticipantId: "اسکان",
      sellerParticipantId: "اسکان",
    });
  if (includeBaseline)
    mockTrades.push({
      ...mockTrades[0]!,
      id: "unproven-old",
      sourceMessageId: 99,
      quantity: 99,
      compactPrice: 90_000,
      rawPrice: 90_000_000n,
      announcedAt: new Date("2026-09-01T10:00:00Z"),
    });
  const allTrades = includeSettlement
    ? [
        ...mockTrades,
        {
          id: "settlement-1",
          chatId: 100n,
          sourceMessageId: null,
          settlementMessageId: 103,
          type: "SETTLEMENT" as const,
          referenceNumber: null,
          buyerParticipantId: null,
          sellerParticipantId: "اسکان",
          quantity: 1,
          compactPrice: 106000,
          rawPrice: 106000000n,
          receiptTimeText: null,
          announcedAt: new Date("2026-09-10T10:00:00Z"),
          createdAt: new Date("2026-09-10T10:00:00Z"),
        },
      ]
    : mockTrades;

  const store = {
    user: async (identity: { telegramUserId: string }) => ({
      id: identity.telegramUserId,
    }),
    latestQuote: async () => null,
    latestTrade: async () => null,
    quotesSince: async () => [],
    activeRequests: async () => [],
    requestHistory: async () => ({ items: [], nextCursor: null }),
    request: async () => null,
    createRequest: async () => null,
    updateRequest: async () => null,
    cancelRequest: async () => null,
    session: async () => null,
    participant: async (alias: string) =>
      alias === "اسکان" || alias === "مرداد" || alias === "عرفاان"
        ? { id: alias, telegramUserId: null }
        : null,

    // Analytics repository methods
    activeParticipantAliasesInWindow: async () => ["اسکان", "مرداد", "عرفاان"],
    tradesForParticipantsChronological: async () => allTrades,
    participantTradesChronological: async (alias: string) =>
      allTrades.filter(
        (t) =>
          t.buyerParticipantId === alias || t.sellerParticipantId === alias,
      ),
    earliestTradeDate: async () => new Date("2026-09-08T10:00:00Z"),
    hasAppliedSettlement: async () => includeBaseline,
    appliedSettlements: async () =>
      includeBaseline
        ? [
            {
              chatId: 100n,
              sourceMessageId: 100,
              isBootstrap: true,
              announcedAt: new Date("2026-09-01T12:00:00Z"),
            },
          ]
        : [],
    ingestionState: async () =>
      includeBaseline
        ? { gateStatus: "OPEN", coverageVerifiedThroughMessageId: 0 }
        : null,
    analyticsRevision: async () => "0",
  } as unknown as AppDependencies["store"];

  const deps: AppDependencies = {
    store,
    authenticate: () => ({ telegramUserId: "1001", firstName: "Tester" }),
    acceptCommand: async (_id, input) => ({
      operationId: input.operationId,
      acceptedAt: new Date().toISOString(),
    }),
    command: async () => ({}) as any,
  };

  const app = createApp(deps);
  const link = new RPCLink({
    url: "http://localhost/rpc",
    fetch: async (request) => app.request(request),
    headers: () => ({ "X-Telegram-Init-Data": "valid" }),
  });
  const client: RpcClient = createORPCClient(link);

  return { client };
}

test("analytics.traders returns sorted participant list via oRPC", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture();
  const traders = await client.analytics.traders({
    sortBy: "REALIZED_PNL",
    sortOrder: "DESC",
    limit: 10,
  });

  assert.ok(Array.isArray(traders));
  assert.equal(traders.length, 3);
  // اسکان bought 2 @ 105000, sold 1 @ 105200 -> Realized P&L = +200 points = +4,617,018 Tomans
  const eskan = traders.find((t) => t.alias === "اسکان");
  assert.ok(eskan);
  assert.equal(eskan.realizedPnlPoints, 200);
  assert.equal(eskan.realizedPnlTomans, 4_617_018);
  assert.equal(eskan.totalVolume, 3); // 2 buy + 1 sell
  assert.equal(eskan.observedPosition, 1); // 2 - 1 = 1 Long
});

test("analytics.traderDetail returns detail and recent trades for valid alias", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture();
  const detail = await client.analytics.traderDetail({ alias: "اسکان" });

  assert.ok(detail);
  assert.equal(detail.summary.alias, "اسکان");
  assert.equal(detail.summary.realizedPnlPoints, 200);
  assert.equal(detail.summary.realizedPnlTomans, 4_617_018);
  const traders = await client.analytics.traders({
    sortBy: "REALIZED_PNL",
    sortOrder: "DESC",
    limit: 10,
  });
  assert.deepEqual(
    detail.summary,
    traders.find((trader) => trader.alias === "اسکان"),
  );
  assert.equal(detail.recentTrades.length, 2);
  assert.equal(detail.recentTrades[0]?.counterpartyAlias, "عرفاان");
});

test("analytics.traderDetail returns null for non-existent alias", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture();
  const detail = await client.analytics.traderDetail({ alias: "ناشناس" });
  assert.equal(detail, null);
});

test("analytics V2 exposes typed trades and marks P&L unreliable without baseline", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture();
  const detail = await client.analytics.traderDetailV2({ alias: "اسکان" });
  assert.ok(detail);
  assert.equal(detail.summary.realizedPnlTomans, null);
  assert.equal(detail.summary.coverage.positionBaselineValid, false);
  assert.equal(detail.summary.contributions.total.totalTrades, 2);
  assert.equal(detail.recentTrades[0]?.type, "NORMAL");
  assert.equal(detail.recentTrades[0]?.counterpartyAlias, "عرفاان");
});

test("analytics V2 labels synthetic closes with a null counterparty", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture(true);
  const detail = await client.analytics.traderDetailV2({ alias: "اسکان" });
  assert.ok(detail);
  assert.equal(detail.recentTrades[0]?.type, "SETTLEMENT");
  assert.equal(detail.recentTrades[0]?.counterpartyAlias, null);
  assert.equal(detail.summary.contributions.settlement.totalTrades, 1);
  assert.equal(detail.summary.contributions.total.totalTrades, 3);
});

test("analytics V2 retains both sides of historical same-alias trades consistently", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture(false, true);
  const detail = await client.analytics.traderDetailV2({ alias: "اسکان" });
  const list = await client.analytics.tradersV2({
    sortBy: "VOLUME",
    sortOrder: "DESC",
    limit: 10,
  });
  assert.ok(detail);
  assert.deepEqual(
    detail.summary,
    list.find((row) => row.alias === "اسکان"),
  );
  assert.equal(detail.summary.observedPosition, 1);
  assert.equal(detail.summary.totalTrades, 4);
  assert.equal(
    detail.recentTrades.filter((row) => row.id === "self-1").length,
    2,
  );
});

test("V2 zero baseline excludes unproven inventory and accounts for a synthetic close once", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture(true, false, true);
  const detail = await client.analytics.traderDetailV2({ alias: "اسکان" });
  assert.ok(detail);
  assert.equal(detail.summary.observedPosition, 0);
  assert.equal(detail.summary.currentCostBasis, 0);
  assert.equal(detail.summary.realizedPnlPoints, 1200);
  assert.equal(detail.summary.contributions.normal.realizedPnlPoints, 200);
  assert.equal(detail.summary.contributions.settlement.realizedPnlPoints, 1000);
  assert.equal(detail.summary.coverage.positionBaselineValid, true);
  assert.equal(detail.summary.coverage.pnlReliable, false);
  assert.equal(detail.summary.confidence, "ESTIMATED");
  await assert.rejects(client.analytics.traderDetail({ alias: "اسکان" }));
});

test("analytics V1 retains both sides of historical same-alias trades consistently", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture(false, true);
  const detail = await client.analytics.traderDetail({ alias: "اسکان" });
  const list = await client.analytics.traders({
    sortBy: "VOLUME",
    sortOrder: "DESC",
    limit: 10,
  });
  assert.ok(detail);
  assert.deepEqual(
    detail.summary,
    list.find((row) => row.alias === "اسکان"),
  );
  assert.equal(detail.summary.observedPosition, 1);
  assert.equal(detail.summary.totalTrades, 4);
  assert.equal(
    detail.recentTrades.filter((row) => row.id === "self-1").length,
    2,
  );
});

test("analytics V1 marks confidence as ESTIMATED in absence of bootstrap baseline", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-10T12:00:00Z"),
  });
  const { client } = fixture();
  const detail = await client.analytics.traderDetail({ alias: "اسکان" });
  assert.ok(detail);
  assert.equal(detail.summary.confidence, "ESTIMATED");
});
