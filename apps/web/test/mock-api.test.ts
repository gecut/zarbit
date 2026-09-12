/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
import {
  createMockApi,
  getSessionScenario,
  mockIdentity,
} from "../src/dev/mock-api";
import { adaptLegacyApi } from "../src/shared/api/legacy-adapter";
import { createRpcUtils } from "../src/shared/api/orpc";
import { createQueryClient } from "../src/shared/api/query-client";

test("creates mock api safely without window defined", async () => {
  const api = createMockApi();
  const identity = await api.authenticate();
  assert.equal(identity.telegramUserId, mockIdentity.telegramUserId);
});

test("returns quote dashboard with latest quote and latest trade", async () => {
  const api = createMockApi();
  const dashboard = await api.getQuoteDashboard();
  assert.ok(
    dashboard.latest,
    "latest quote should be present in normal scenario",
  );
  assert.ok(
    dashboard.latestTrade,
    "latest trade should be present in normal scenario",
  );
  assert.equal(dashboard.points.length, 6);
  assert.notEqual(dashboard.latest.quote, dashboard.latestTrade.price);
});

test("supports quote scenarios dynamically via window search", async () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = { location: { search: "?quoteScenario=empty" } } as any;
    const api = createMockApi();
    const emptyDashboard = await api.getQuoteDashboard();
    assert.equal(emptyDashboard.latest, null);
    assert.equal(emptyDashboard.latestTrade, null);
    assert.deepEqual(emptyDashboard.points, []);

    // Change search dynamically without recreating api
    globalThis.window = { location: { search: "?quoteScenario=stale" } } as any;
    const staleDashboard = await api.getQuoteDashboard();
    assert.ok(staleDashboard.latest);
    assert.ok(staleDashboard.latestTrade);

    // Error scenario
    globalThis.window = { location: { search: "?quoteScenario=error" } } as any;
    await assert.rejects(
      async () => api.getQuoteDashboard(),
      (err: any) => err instanceof AppError && err.code === "MOCK_ERROR",
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test("parses session scenarios correctly", () => {
  assert.equal(
    getSessionScenario("?sessionScenario=disconnected"),
    "disconnected",
  );
  assert.equal(
    getSessionScenario("?sessionScenario=login_pending"),
    "login_pending",
  );
  assert.equal(
    getSessionScenario("?sessionScenario=not_in_group"),
    "not_in_group",
  );
  assert.equal(getSessionScenario("?sessionScenario=degraded"), "degraded");
  assert.equal(getSessionScenario("?sessionScenario=revoked"), "revoked");
  assert.equal(getSessionScenario("?sessionScenario=error"), "error");
  assert.equal(getSessionScenario(""), "active");
});

test("handles session login lifecycle, 2FA, invalid code, and cancellation", async () => {
  const api = createMockApi();
  let session = await api.getTelegramSession();
  assert.equal(session.kind, "ACTIVE");

  // Revoke active session
  session = await api.sessionCommand({ type: "revoke" });
  assert.equal(session.kind, "REVOKED");

  // Initiate login
  session = await api.sessionCommand({ type: "login", phone: "+989123456789" });
  assert.equal(session.kind, "LOGIN_PENDING");
  assert.ok(session.login);
  assert.equal(session.login.step, "CODE");
  const loginId = session.login.id;

  // Invalid code rejected
  await assert.rejects(
    async () =>
      api.sessionCommand({ type: "code", id: loginId, code: "00000" }),
    (err: any) => err instanceof AppError && err.code === "INVALID_CODE",
  );

  // 2FA step transition with special dev code 22222
  session = await api.sessionCommand({
    type: "code",
    id: loginId,
    code: "22222",
  });
  assert.equal(session.kind, "LOGIN_PENDING");
  assert.ok(session.login);
  assert.equal(session.login.step, "PASSWORD");

  // Wrong 2FA password rejected
  await assert.rejects(
    async () =>
      api.sessionCommand({
        type: "password",
        id: loginId,
        password: "wrong",
      }),
    (err: any) => err instanceof AppError && err.code === "INVALID_PASSWORD",
  );

  // Correct 2FA password completes login
  session = await api.sessionCommand({
    type: "password",
    id: loginId,
    password: "correct-password",
  });
  assert.equal(session.kind, "ACTIVE");
});

test("handles session membership recovery from NOT_IN_GROUP", async () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { search: "?sessionScenario=not_in_group" },
    } as any;
    const api = createMockApi();
    let session = await api.getTelegramSession();
    assert.equal(session.kind, "NOT_IN_GROUP");

    session = await api.sessionCommand({ type: "membership" });
    assert.equal(session.kind, "ACTIVE");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("handles request CRUD and validates active-only mutations", async () => {
  const api = createMockApi();
  const active = await api.getActiveRequests();
  const history = await api.getRequestHistory();
  assert.equal(active.length, 2);
  assert.equal(history.items.length, 4);

  // Create new request
  const created = await api.createRequest({
    action: "BUY",
    condition: "LTE",
    targetPrice: 95_000,
    units: 3,
  });
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.executionPhase, "WAITING_QUOTE");
  assert.equal(created.targetPrice, 95_000);
  assert.equal(created.units, 3);

  // Update active request
  const updated = await api.updateRequest(created.id, {
    action: "ALERT",
    condition: "GTE",
    targetPrice: 97_000,
    units: null,
  });
  assert.equal(updated.action, "ALERT");
  assert.equal(updated.condition, "GTE");
  assert.equal(updated.targetPrice, 97_000);
  assert.equal(updated.units, null);

  // Force-send active request
  const sent = await api.forceSendRequest(created.id);
  assert.equal(sent.status, "DONE");
  assert.equal(sent.executionPhase, "DONE");
  assert.ok(sent.outgoingMessageId);
  assert.ok(sent.completedAt);

  // Attempting to update or cancel a completed request fails with conflict
  await assert.rejects(
    async () =>
      api.updateRequest(created.id, {
        action: "BUY",
        condition: "LTE",
        targetPrice: 90000,
        units: 1,
      }),
    (err: any) => err instanceof AppError && err.code === "REQUEST_CONFLICT",
  );
  await assert.rejects(
    async () => api.cancelRequest(created.id),
    (err: any) => err instanceof AppError && err.code === "REQUEST_CONFLICT",
  );

  // Cancel another active request
  const firstActive = (await api.getActiveRequests())[0]!;
  const cancelled = await api.cancelRequest(firstActive.id);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.executionPhase, "CANCELLED");
  assert.equal(cancelled.cancellationReason, "لغو توسط کاربر");
  assert.ok(cancelled.completedAt);
});

test("supports empty requests scenario", async () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { search: "?requestsScenario=empty" },
    } as any;
    const api = createMockApi();
    const active = await api.getActiveRequests();
    const history = await api.getRequestHistory();
    assert.equal(active.length, 0);
    assert.equal(history.items.length, 0);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("interoperates seamlessly with adaptLegacyApi and createRpcUtils", async () => {
  const api = createMockApi();
  const rpc = adaptLegacyApi(api);
  const utils = createRpcUtils(rpc, "test-mock-scope");
  const client = createQueryClient();

  try {
    const dashboard = await client.fetchQuery(
      utils.quote.dashboard.queryOptions(),
    );
    assert.ok(dashboard.latest);
    assert.ok(dashboard.latestTrade);

    const session = await client.fetchQuery(
      utils.telegram.status.queryOptions(),
    );
    assert.equal(session.kind, "ACTIVE");

    const activeRequests = await client.fetchQuery(
      utils.requests.active.queryOptions(),
    );
    assert.equal(activeRequests.length, 2);

    const traders = await client.fetchQuery(
      utils.analytics.traders.queryOptions(),
    );
    assert.ok(Array.isArray(traders));
    assert.ok(traders.length > 0);
  } finally {
    client.clear();
  }
});

test("mock api supports analytics scenarios and RPC client integration", async () => {
  const api = createMockApi();
  const rpc = adaptLegacyApi(api);

  // Normal list
  const traders = await rpc.analytics.traders();
  assert.ok(traders.length >= 10);
  assert.equal(traders[0]?.alias, "اسکان");

  // Trader detail
  const detail = await rpc.analytics.traderDetail({ alias: "اسکان" });
  assert.ok(detail);
  assert.equal(detail.summary.alias, "اسکان");
  assert.equal(detail.recentTrades.length, 3);

  // Dynamic search scenario: empty
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: { search: "?tradersScenario=empty" },
    } as any;
    const emptyTraders = await rpc.analytics.traders();
    assert.equal(emptyTraders.length, 0);

    // Dynamic search scenario: error
    globalThis.window = {
      location: { search: "?tradersScenario=error" },
    } as any;
    await assert.rejects(
      async () => rpc.analytics.traders(),
      (err: any) => err instanceof AppError && err.code === "MOCK_ERROR",
    );
  } finally {
    globalThis.window = originalWindow;
  }
});
