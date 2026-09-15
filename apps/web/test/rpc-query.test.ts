import { sessionFixture } from "./telegram-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
import {
  fastQuery,
  retryDelay,
  retryQuery,
  sessionInterval,
} from "../src/shared/api/query-policy";

// Exercise QueryObserver's browser lifecycle without a DOM or real network.
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { addEventListener() {}, removeEventListener() {} },
});
const { QueryObserver, focusManager, onlineManager } =
  await import("@tanstack/react-query");
const { createQueryClient } = await import("../src/shared/api/query-client");
const { createRpcClient, createRpcUtils } =
  await import("../src/shared/api/orpc");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fixture() {
  let calls = 0;
  const signals: AbortSignal[] = [];
  const rpc = createRpcClient(
    "http://server/rpc",
    () => "test",
    async (_request, init) => {
      calls++;
      if (init?.signal) signals.push(init.signal);
      return Response.json({
        json: {
          quote: null,
          trade: null,
          revision: 0,
          tradeQuoteDifference: null,
          asOf: "2026-09-13T12:00:00.000Z",
        },
      });
    },
  );
  return { rpc, signals, calls: () => calls };
}

test("generated keys isolate accounts, deduplicate and invalidate by procedure", async () => {
  const f = fixture();
  const a = createRpcUtils(f.rpc, "alice");
  const b = createRpcUtils(f.rpc, "bob");
  assert.notDeepEqual(
    a.market.snapshot.queryKey(),
    b.market.snapshot.queryKey(),
  );
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, gcTime: 0 },
  });
  try {
    await Promise.all([
      client.fetchQuery(a.market.snapshot.queryOptions()),
      client.fetchQuery(a.market.snapshot.queryOptions()),
    ]);
    assert.equal(f.calls(), 1);
    await client.invalidateQueries({ queryKey: a.market.key() });
    await client.fetchQuery(a.market.snapshot.queryOptions());
    assert.equal(f.calls(), 2);
  } finally {
    client.clear();
  }
});
test("cancellation reaches transport rather than replacing the caller signal", async () => {
  let signal: AbortSignal | undefined;
  const rpc = createRpcClient(
    "http://server/rpc",
    () => "test",
    async (_request, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_, reject) =>
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      );
    },
  );
  const api = createRpcUtils(rpc, "cancel");
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, gcTime: 0 },
  });
  try {
    const request = client
      .fetchQuery(api.market.snapshot.queryOptions())
      .catch(() => undefined);
    await delay(20);
    await client.cancelQueries({ queryKey: api.market.key() });
    await request;
    assert.equal(signal?.aborted, true);
  } finally {
    client.clear();
  }
});
test("background polling, focus refresh and offline/reconnect use Query lifecycle", async () => {
  const f = fixture();
  const api = createRpcUtils(f.rpc, "lifecycle");
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, gcTime: 0 },
  });
  client.mount();
  focusManager.setFocused(false);
  onlineManager.setOnline(true);
  const observer = new QueryObserver(
    client,
    api.market.snapshot.queryOptions({
      ...fastQuery,
      staleTime: 0,
      refetchInterval: 30,
    }),
  );
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await delay(140);
    assert.ok(f.calls() >= 2, "polls while hidden");
    onlineManager.setOnline(false);
    await delay(20);
    const paused = f.calls();
    await delay(80);
    assert.equal(f.calls(), paused);
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
    await delay(40);
    assert.ok(f.calls() > paused);
    focusManager.setFocused(false);
    const beforeFocus = f.calls();
    focusManager.setFocused(true);
    await delay(20);
    assert.ok(f.calls() > beforeFocus);
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
  }
});
test("validation and auth never retry; transient reads respect retry deadlines", () => {
  assert.equal(retryQuery(0, new AppError("INVALID_INPUT", "", 400)), false);
  assert.equal(retryQuery(0, new AppError("UNAUTHORIZED", "", 401)), false);
  assert.equal(retryQuery(0, new AppError("NETWORK", "", 503)), true);
  assert.equal(retryQuery(2, new AppError("NETWORK", "", 503)), false);
  assert.ok(
    retryDelay(
      0,
      new AppError(
        "RATE_LIMITED",
        "",
        429,
        new Date(Date.now() + 5000).toISOString(),
      ),
    ) >= 4900,
  );
});
test("session polling uses stable cadence and accelerates transitions", () => {
  const state = sessionFixture({
    authorization: "REVOKED",
    connectedTelegramUserId: null,
  });
  assert.equal(sessionInterval(state), 15_000);
  assert.equal(sessionInterval({ ...state, authorization: "REVOKING" }), 2000);
  assert.equal(
    sessionInterval({
      ...state,
      authorization: "AUTHORIZED",
      connection: "CONNECTED",
    }),
    15_000,
  );
});

test("401 removes private snapshots even if an input contains identity", async () => {
  const f = fixture();
  const api = createRpcUtils(f.rpc, "auth-check");
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { gcTime: 0, retry: false } });
  try {
    const identity = api.auth.identity.queryOptions({
      gcTime: 0,
      queryFn: async () => ({ telegramUserId: "alice" }),
    });
    await client.fetchQuery(identity);
    const privateKey = api.requests.detail.queryKey({
      input: { id: "identity" },
    });
    client.setQueryData(privateKey, {
      id: "identity",
      condition: "GTE",
      action: "ALERT",
      targetPrice: 95900,
      units: null,
      status: "ACTIVE",
      executing: false,
      triggeredPrice: null,
      triggerSource: null,
      triggeredTradeId: null,
      triggeredAt: null,
      triggeredMessageId: null,
      outgoingMessageId: null,
      completedAt: null,
      failureReason: null,
      cancellationReason: null,
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    });
    await assert.rejects(
      client.fetchQuery({
        queryKey: ["denied"],
        queryFn: async () => {
          throw new AppError("UNAUTHORIZED", "ورود نامعتبر است.", 401);
        },
      }),
    );
    assert.equal(client.getQueryData(privateKey), undefined);
    assert.equal(client.getQueryData(identity.queryKey), undefined);
    assert.equal(client.getQueryState(identity.queryKey)?.status, "error");
  } finally {
    client.clear();
  }
});

test("mutations fail once while offline instead of queuing or replaying", async () => {
  const { MutationObserver } = await import("@tanstack/react-query");
  let calls = 0;
  const rpc = createRpcClient(
    "http://server/rpc",
    () => "test",
    async () => {
      calls++;
      throw new TypeError("offline");
    },
  );
  const api = createRpcUtils(rpc, "mutation");
  const client = createQueryClient();
  onlineManager.setOnline(false);
  try {
    const observer = new MutationObserver(
      client,
      api.telegram.command.mutationOptions(),
    );
    await assert.rejects(
      observer.mutate({
        operationId: crypto.randomUUID(),
        command: { type: "revoke" },
      }),
      {
        code: "NETWORK",
      },
    );
    onlineManager.setOnline(true);
    await delay(10);
    assert.equal(calls, 1);
    observer.reset();
  } finally {
    onlineManager.setOnline(true);
    client.clear();
  }
});

test("quote dashboard query delivers both official quote and completed trade in a single query path", async () => {
  let calls = 0;
  const rpc = createRpcClient(
    "http://server/rpc",
    () => "test",
    async () => {
      calls++;
      return Response.json({
        json: {
          quote: {
            compactPrice: 105_020,
            announcedAt: "2026-09-12T07:00:00.000Z",
            sourceMessageId: 1,
          },
          trade: {
            id: "trade-1",
            compactPrice: 105_120,
            quantity: 1,
            announcedAt: "2026-09-12T07:01:00.000Z",
            sourceMessageId: 2,
          },
          revision: 2,
          tradeQuoteDifference: 100,
          asOf: "2026-09-12T07:01:00.000Z",
        },
      });
    },
  );
  const api = createRpcUtils(rpc, "market-snapshot");
  const client = createQueryClient();
  try {
    const data = await client.fetchQuery(api.market.snapshot.queryOptions());
    assert.equal(calls, 1, "only a single query network call was made");
    assert.equal(data.quote?.compactPrice, 105_020);
    assert.equal(data.trade?.compactPrice, 105_120);
    assert.notEqual(data.quote?.compactPrice, data.trade?.compactPrice);
  } finally {
    client.clear();
  }
});

test("creating a request seeds an empty active cache and invalidates every request query", async () => {
  const { MutationObserver } = await import("@tanstack/react-query");
  const { requestMutationOptions } =
    await import("../src/modules/requests/_request-mutation-options");
  const created = {
    id: "new-request",
    action: "ALERT",
    condition: "GTE",
    targetPrice: 95900,
    units: null,
    status: "ACTIVE",
    executing: false,
    triggeredPrice: null,
    triggerSource: null,
    triggeredTradeId: null,
    triggeredAt: null,
    triggeredMessageId: null,
    outgoingMessageId: null,
    completedAt: null,
    failureReason: null,
    cancellationReason: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  } satisfies import("@zarbit/contracts").RequestDetail;
  const rpc = createRpcClient(
    "http://server/rpc",
    () => "test",
    async () => Response.json({ json: created }),
  );
  const api = createRpcUtils(rpc, "create-test");
  const other = createRpcUtils(rpc, "other-account");
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity },
    mutations: { gcTime: 0 },
  });
  client.setQueryData(api.requests.active.queryKey(), []);
  client.setQueryData(other.requests.active.queryKey(), []);
  const history = api.requests.history.queryKey({ input: {} });
  client.setQueryData(history, { items: [], nextCursor: null });
  const infinite = api.requests.history.infiniteOptions({
    input: (cursor: string | undefined) => ({ cursor }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  }).queryKey;
  client.setQueryData(infinite, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
  let activeReads = 0;
  const active = new QueryObserver(
    client,
    api.requests.active.queryOptions({
      queryFn: async () => {
        activeReads++;
        throw new Error("refetch unavailable");
      },
      refetchOnMount: false,
      refetchInterval: (query) => (query.state.data?.length ? 4_000 : false),
    }),
  );
  const unsubscribe = active.subscribe(() => undefined);
  try {
    await delay(30);
    assert.equal(activeReads, 0, "empty cache does not poll");
    const mutation = new MutationObserver(
      client,
      requestMutationOptions(api, client).create,
    );
    await mutation.mutate({
      action: "ALERT",
      condition: "GTE",
      targetPrice: 95900,
      units: null,
    });
    assert.deepEqual(client.getQueryData(api.requests.active.queryKey()), [
      created,
    ]);
    assert.equal(
      active.getCurrentResult().isError,
      true,
      "failed refetch retains confirmed request for polling",
    );
    for (const key of [
      api.requests.active.queryKey(),
      history,
      infinite,
      api.requests.detail.queryKey({ input: { id: created.id } }),
    ]) {
      assert.equal(client.getQueryState(key)?.isInvalidated, true);
    }
    assert.equal(
      client.getQueryState(other.requests.active.queryKey())?.isInvalidated,
      false,
    );
    await mutation.mutate({
      action: "ALERT",
      condition: "GTE",
      targetPrice: 95900,
      units: null,
    });
    assert.deepEqual(
      client.getQueryData(api.requests.active.queryKey()),
      [created],
      "no duplicate cache entries",
    );
    const readsAfterCreate = activeReads;
    await delay(4_200);
    assert.ok(
      activeReads > readsAfterCreate,
      "polling resumes after creation despite refetch failures",
    );
    mutation.reset();
  } finally {
    unsubscribe();
    client.clear();
  }
});
