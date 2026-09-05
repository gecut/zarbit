import assert from "node:assert/strict";
import test from "node:test";
import { AppError, type TelegramSessionStatus } from "@zarbit/contracts";
import { Hono } from "hono";
import type { AppDependencies, AppEnv } from "../src/app-types";
import {
  createWorkerCommand,
  type SessionReader,
} from "../src/telegram-session";
import { registerTelegramSessionRoutes } from "../src/telegram-session-routes";

const storedSession = {
  state: "ACTIVE" as const,
  connectedTelegramUserId: "123456",
  membershipCheckedAt: new Date("2026-09-05T16:00:00.000Z"),
};

const onlineStatus: TelegramSessionStatus = {
  state: "ACTIVE",
  connection: "CONNECTED",
  connectedTelegramUserId: "123456",
  membershipCheckedAt: "2026-09-05T16:00:00.000Z",
  canManageRequests: true,
  error: null,
  login: null,
};

function statusStore(
  session: SessionReader["session"] = async () => storedSession,
): SessionReader {
  return { session };
}

function commandWith(options?: {
  fetch?: typeof globalThis.fetch;
  log?: Parameters<typeof createWorkerCommand>[0]["log"];
  store?: SessionReader;
  token?: string;
}) {
  return createWorkerCommand({
    fetch:
      options?.fetch ??
      (async () =>
        Response.json({ data: onlineStatus }, { status: 200 })) as typeof fetch,
    log: options?.log ?? (() => undefined),
    store: options?.store ?? statusStore(),
    workerInternalToken:
      options && "token" in options ? options.token : "a".repeat(32),
    workerInternalUrl: "http://worker:3002",
  });
}

async function assertOffline(
  command: ReturnType<typeof createWorkerCommand>,
) {
  const status = await command("user-1", { type: "status" });
  assert.equal(status.connection, "OFFLINE");
  assert.equal(status.canManageRequests, false);
  assert.equal(status.login, null);
  assert.equal(status.state, "ACTIVE");
}

function statusRouteApp(command: ReturnType<typeof createWorkerCommand>) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", telegramUserId: "123456" });
    await next();
  });
  registerTelegramSessionRoutes(
    app,
    { command, store: {} } as AppDependencies,
  );
  return app;
}

test("returns the validated worker status", async () => {
  const status = await commandWith()("user-1", { type: "status" });
  assert.deepEqual(status, onlineStatus);
});

test("returns offline status when the worker is unconfigured", async () => {
  await assertOffline(commandWith({ token: undefined }));
});

test("keeps the status endpoint successful while the worker is offline", async () => {
  const app = statusRouteApp(
    commandWith({
      fetch: async () => new Response("gateway", { status: 502 }),
    }),
  );

  const response = await app.request("http://server/api/telegram-session/status");
  const body = (await response.json()) as { data: TelegramSessionStatus };

  assert.equal(response.status, 200);
  assert.equal(body.data.connection, "OFFLINE");
});

test("returns offline status for network, malformed JSON, invalid envelopes, and forbidden worker responses", async () => {
  const failingFetch: typeof fetch = async () => {
    throw new Error("connection refused");
  };
  await assertOffline(commandWith({ fetch: failingFetch }));

  await assertOffline(
    commandWith({
      fetch: async () =>
        new Response("<html>bad gateway</html>", { status: 502 }),
    }),
  );

  await assertOffline(
    commandWith({
      fetch: async () =>
        new Response("{not-json", {
          headers: { "content-type": "application/json" },
        }),
    }),
  );

  await assertOffline(
    commandWith({
      fetch: async () =>
        Response.json({ data: { connection: "CONNECTED" } }, { status: 200 }),
    }),
  );

  await assertOffline(
    commandWith({
      fetch: async () =>
        Response.json(
          { error: { code: "FORBIDDEN", message: "دسترسی مجاز نیست." } },
          { status: 403 },
        ),
    }),
  );
});

test("logs an identical status fallback only once per minute", async () => {
  const logs: Array<{ failure: string }> = [];
  const command = commandWith({
    fetch: async () => {
      throw new Error("connection refused");
    },
    log: (_, details) => logs.push({ failure: details.failure }),
  });

  await assertOffline(command);
  await assertOffline(command);

  assert.deepEqual(logs, [{ failure: "network" }]);
});

test("keeps mutating commands unavailable for invalid and forbidden worker responses", async () => {
  const command = commandWith({
    fetch: async () => new Response("gateway", { status: 502 }),
  });

  await assert.rejects(
    () => command("user-1", { type: "membership" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "WORKER_UNAVAILABLE" &&
      error.status === 503,
  );

  const forbiddenCommand = commandWith({
    fetch: async () =>
      Response.json(
        { error: { code: "FORBIDDEN", message: "دسترسی مجاز نیست." } },
        { status: 403 },
      ),
  });

  await assert.rejects(
    () => forbiddenCommand("user-1", { type: "membership" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "WORKER_UNAVAILABLE" &&
      error.status === 503,
  );
});

test("preserves valid worker errors for mutating commands", async () => {
  const retryAt = "2026-09-05T16:30:00.000Z";
  const command = commandWith({
    fetch: async () =>
      Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "کمی بعد تلاش کنید.",
            retryAt,
          },
        },
        { status: 429 },
      ),
  });

  await assert.rejects(
    () => command("user-1", { type: "membership" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "RATE_LIMITED" &&
      error.status === 429 &&
      error.retryAt === retryAt,
  );
});

test("returns a real unavailable error when fallback storage fails", async () => {
  const command = commandWith({
    fetch: async () => {
      throw new Error("connection refused");
    },
    store: statusStore(async () => {
      throw new Error("database unavailable");
    }),
  });

  await assert.rejects(
    () => command("user-1", { type: "status" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "WORKER_UNAVAILABLE" &&
      error.status === 503,
  );
});
