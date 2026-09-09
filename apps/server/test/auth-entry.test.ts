import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type { RpcClient } from "@zarbit/contracts/rpc";
import type { AppDependencies } from "../src/app-types";

process.env.TELEGRAM_BOT_TOKEN = "test-only-token";
process.env.ALLOWED_TELEGRAM_USER_IDS = "101,102";
process.env.NODE_ENV = "production";
const { authenticateTelegramRequest } = await import("../src/auth");
const { createApp } = await import("../src/app");
function signed(id: number, age = 0) {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - age),
    user: JSON.stringify({ id, first_name: "Test" }),
  });
  const secret = createHmac("sha256", "WebAppData")
    .update("test-only-token")
    .digest();
  p.set(
    "hash",
    createHmac("sha256", secret)
      .update(
        [...p.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join("\n"),
      )
      .digest("hex"),
  );
  return p.toString();
}
test("real signed identity works for new/existing accounts through Hono, single and batch", async () => {
  const users = new Set<string>(["102"]);
  const app = createApp({
    authenticate: authenticateTelegramRequest,
    store: {
      user: async (identity: { telegramUserId: string }) => {
        users.add(identity.telegramUserId);
        return { id: identity.telegramUserId };
      },
    },
  } as unknown as AppDependencies);
  for (const batch of [false, true]) {
    for (const id of [101, 102]) {
      const client: RpcClient = createORPCClient(
        new RPCLink({
          url: "http://test/rpc",
          headers: { "X-Telegram-Init-Data": signed(id) },
          plugins: batch
            ? [
                new BatchLinkPlugin({
                  groups: [{ condition: () => true, context: {} }],
                }),
              ]
            : [],
          fetch: async (r) => app.request(r),
        }),
      );
      const results = await Promise.all([
        client.auth.identity(),
        client.auth.identity(),
      ]);
      assert.equal(results[0].telegramUserId, String(id));
    }
  }
  assert.deepEqual([...users].sort(), ["101", "102"]);
});
test("missing, invalid, expired and non-allowlisted identities never reach the store", async () => {
  let reads = 0;
  const app = createApp({
    authenticate: authenticateTelegramRequest,
    store: {
      user: async () => {
        reads++;
        return { id: "never" };
      },
    },
  } as unknown as AppDependencies);
  for (const value of ["", "invalid", signed(101, 86401), signed(999)]) {
    const client: RpcClient = createORPCClient(
      new RPCLink({
        url: "http://test/rpc",
        headers: { "X-Telegram-Init-Data": value },
        fetch: async (r) => app.request(r),
      }),
    );
    await assert.rejects(
      client.auth.identity(),
      (e) => e instanceof ORPCError && e.status === 401,
    );
  }
  assert.equal(reads, 0);
});
test("database failure becomes a safe service error after successful authentication", async () => {
  const app = createApp({
    authenticate: authenticateTelegramRequest,
    store: {
      user: async () => {
        throw new Error("private-db-error");
      },
    },
  } as unknown as AppDependencies);
  const client: RpcClient = createORPCClient(
    new RPCLink({
      url: "http://test/rpc",
      headers: { "X-Telegram-Init-Data": signed(101) },
      fetch: async (r) => app.request(r),
    }),
  );
  await assert.rejects(
    client.auth.identity(),
    (e) =>
      e instanceof ORPCError &&
      e.status === 503 &&
      !e.message.includes("private-db-error"),
  );
});
