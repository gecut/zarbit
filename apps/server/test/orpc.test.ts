import assert from "node:assert/strict";
import test from "node:test";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import {
  AppError,
  type WorkerCommand,
  type TelegramSessionStatus,
} from "@zarbit/contracts";
import type { RpcClient } from "@zarbit/contracts/rpc";
import { createApp } from "../src/app/create-app";
import type { AppDependencies } from "../src/app-dependencies";
import { generateOpenApi } from "../src/transport/http/generate-open-api";

function fixture() {
  let userReads = 0,
    quoteReads = 0,
    activeReads = 0;
  const commands: string[] = [];
  const events: string[] = [];
  const status: TelegramSessionStatus = {
    kind: "ACTIVE",
    state: "ACTIVE",
    connection: "CONNECTED",
    reasonCode: "NONE",
    groupId: null,
    quoteSenderId: null,
    connectedTelegramUserId: "alice",
    membershipCheckedAt: null,
    observedAt: "2026-09-05T16:00:00.000Z",
    stateChangedAt: "2026-09-05T16:00:00.000Z",
    retryAt: null,
    capabilities: {
      canLogin: true,
      canCreateRequest: true,
      canCheckMembership: true,
      canRevoke: true,
    },
    error: null,
    login: null,
  };
  const store = {
    user: async (identity: { telegramUserId: string }) => {
      userReads++;
      return { id: identity.telegramUserId };
    },
    latestQuote: async () => {
      quoteReads++;
      return null;
    },
    quotesSince: async () => [],
    activeRequests: async (id: string) => {
      activeReads++;
      events.push(`active:${id}`);
      return [];
    },
    requestHistory: async (id: string, cursor?: string) => {
      events.push(`history:${id}:${cursor}`);
      return { items: [], nextCursor: null };
    },
    request: async (id: string) => {
      events.push(`detail:${id}`);
      return null;
    },
    disableSession: async () => {
      events.push("disable");
    },
    createRequest: async () => {
      throw new AppError("CONFLICT", "درخواست تکراری است.", 409);
    },
    cancelRequest: async () => {
      throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
    },
  };
  const app = createApp({
    store,
    authenticate: (value: string | undefined) => {
      if (!value) throw new Error("not allowed");
      return { telegramUserId: value };
    },
    command: async (_id: string, command: WorkerCommand) => {
      commands.push(command.type);
      events.push(command.type);
      return { ...status };
    },
  } as unknown as AppDependencies);
  const client = (identity = "alice", batch = false): RpcClient =>
    createORPCClient(
      new RPCLink({
        url: "http://server/rpc",
        headers: { "X-Telegram-Init-Data": identity },
        plugins: batch
          ? [
              new BatchLinkPlugin({
                groups: [{ condition: () => true, context: {} }],
                maxSize: 4,
              }),
            ]
          : [],
        fetch: async (request) => app.request(request),
      }),
    );
  return {
    app,
    client,
    status,
    commands,
    events,
    counts: () => ({ userReads, quoteReads, activeReads }),
  };
}

test("every RPC route authenticates, cold reads coalesce and user caches stay isolated", async () => {
  const f = fixture();
  await assert.rejects(
    f.client("").quote.dashboard(),
    (error: unknown) => error instanceof ORPCError && error.status === 401,
  );
  assert.equal(f.counts().quoteReads, 0);
  const a = f.client();
  const start = performance.now();
  const timings = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const before = performance.now();
      assert.deepEqual(await a.quote.dashboard(), { latest: null, points: [] });
      return performance.now() - before;
    }),
  );
  timings.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      benchmark: "20 simultaneous RPC reads, in-process mock store",
      durationMs: performance.now() - start,
      p95Ms: timings[18],
      ...f.counts(),
    }),
  );
  assert.equal(f.counts().quoteReads, 1);
  assert.equal(f.counts().userReads, 1);
  await a.requests.active();
  await f.client("bob").requests.active();
  assert.deepEqual(
    f.events.filter((event) => event.startsWith("active:")),
    ["active:alice", "active:bob"],
  );
});
test("batched calls keep authentication, CORS and no-store", async () => {
  const f = fixture();
  const client = f.client("alice", true);
  const results = await Promise.all([
    client.auth.identity(),
    client.quote.dashboard(),
    client.telegram.status(),
    client.requests.active(),
  ]);
  assert.equal(results[0].telegramUserId, "alice");
  const response = await f.app.request("http://server/rpc/quote/dashboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": "alice",
    },
    body: "{}",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const options = await f.app.request("http://server/rpc/quote/dashboard", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3001",
      "Access-Control-Request-Headers": "X-Telegram-Init-Data",
    },
  });
  assert.ok(
    options.headers
      .get("access-control-allow-headers")
      ?.includes("X-Telegram-Init-Data"),
  );
});
test("invalid input, cross-user detail and force-send cannot bypass ownership", async () => {
  const f = fixture();
  const client = f.client();
  await assert.rejects(
    client.requests.create({
      action: "ALERT",
      condition: "GTE",
      targetPrice: -1,
      units: null,
    }),
    (error: unknown) => error instanceof ORPCError && error.status === 400,
  );
  assert.equal(f.commands.length, 0);
  await assert.rejects(
    client.requests.forceSend({ id: "other-user-request" }),
    (error: unknown) => error instanceof ORPCError && error.status === 404,
  );
  assert.deepEqual(f.events, ["detail:alice"]);
  assert.equal(f.commands.length, 0);
});
test("mutations bypass cached readiness; revoke persists before worker command", async () => {
  const f = fixture();
  const client = f.client();
  await client.telegram.status();
  Object.assign(f.status, {
    kind: "DEGRADED",
    connection: "OFFLINE",
    reasonCode: "WORKER_UNAVAILABLE",
  });
  await assert.rejects(
    client.requests.create({
      action: "ALERT",
      condition: "GTE",
      targetPrice: 100,
      units: null,
    }),
    (error: unknown) => error instanceof ORPCError && error.code === "CONFLICT",
  );
  assert.deepEqual(f.commands, ["status", "status"]);
  await client.telegram.command({ type: "revoke" });
  assert.ok(f.events.indexOf("disable") < f.events.indexOf("revoke"));
  await client.telegram.status();
  assert.equal(f.commands.at(-1), "status");
});
test("per-user abuse returns a typed retry deadline", async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 35 }, () => f.client().auth.identity()),
  );
  const rejected = outcomes.find((value) => value.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof ORPCError);
  assert.equal(rejected.reason.status, 429);
  assert.equal(typeof rejected.reason.data.retryAfter, "number");
});
test("OpenAPI includes every contract operation and authentication scheme", async () => {
  const spec = await generateOpenApi();
  assert.equal(
    Object.values(spec.paths ?? {}).reduce(
      (count, path) =>
        count +
        Object.keys(path ?? {}).filter((key) =>
          ["get", "post", "patch"].includes(key),
        ).length,
      0,
    ),
    12,
  );
  assert.ok(spec.components?.securitySchemes?.telegram);
});

test("oversized bodies are rejected before procedure work", async () => {
  const f = fixture();
  const response = await f.app.request("http://server/rpc/telegram/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": "alice",
    },
    body: JSON.stringify({
      json: { type: "password", id: "x", password: "x".repeat(20_000) },
    }),
  });
  assert.equal(response.status, 413);
  assert.equal(f.commands.length, 0);
});
test("request writes preserve compact values, conditions, dates and invalidate active reads", async () => {
  const f = fixture();
  const row = {
    id: "owned",
    userId: "alice",
    action: "ALERT" as const,
    condition: "LTE" as const,
    targetPrice: 95900,
    units: null,
    status: "ACTIVE" as const,
    claimToken: null,
    triggeredQuote: null,
    triggeredMessageId: null,
    outgoingMessageId: null,
    completedAt: null,
    failureReason: null,
    cancellationReason: null,
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
  };
  let activeReads = 0;
  const writes: string[] = [];
  const app = createApp({
    authenticate: () => ({ telegramUserId: "alice" }),
    command: async (_id: string, command: WorkerCommand) => {
      writes.push(command.type);
      return f.status;
    },
    store: {
      user: async () => ({ id: "alice" }),
      activeRequests: async () => {
        activeReads++;
        return [row];
      },
      request: async (id: string) => {
        assert.equal(id, "alice");
        return row;
      },
      requestHistory: async (_id: string, cursor: string) => {
        assert.equal(cursor, "next");
        return { items: [], nextCursor: null };
      },
      createRequest: async (id: string, input: object) => {
        assert.equal(id, "alice");
        return { ...row, ...input };
      },
      editRequest: async (_owner: string, _id: string, input: object) => ({
        ...row,
        ...input,
      }),
      cancelRequest: async () => ({
        ...row,
        status: "CANCELLED",
        completedAt: row.updatedAt,
      }),
    },
  } as unknown as AppDependencies);
  const client: RpcClient = createORPCClient(
    new RPCLink({
      url: "http://server/rpc",
      fetch: (req) => Promise.resolve(app.request(req)),
    }),
  );
  await client.requests.active();
  const created = await client.requests.create({
    action: "ALERT",
    condition: "LTE",
    targetPrice: 95900,
    units: null,
  });
  assert.equal(created.targetPrice, 95900);
  assert.equal(created.condition, "LTE");
  assert.equal(created.createdAt, "2026-09-08T00:00:00.000Z");
  await client.requests.active();
  assert.equal(activeReads, 2);
  const updated = await client.requests.update({
    id: "owned",
    data: {
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96100,
      units: null,
    },
  });
  assert.equal(updated.condition, "GTE");
  const cancelled = await client.requests.cancel({ id: "owned" });
  assert.equal(cancelled.status, "CANCELLED");
  await client.requests.forceSend({ id: "owned" });
  assert.deepEqual(writes, ["status", "status", "status", "force-send"]);
  await client.requests.history({ cursor: "next" });
  assert.equal((await client.requests.detail({ id: "owned" })).id, "owned");
});
