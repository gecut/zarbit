import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import type { AppDependencies, AppEnv } from "../src/app-types";
import { createApp } from "../src/app";
import { registerQuoteRoutes } from "../src/quote-routes";

function appWithQuote(
  quote: Awaited<ReturnType<AppDependencies["store"]["latestQuote"]>>,
) {
  const app = new Hono<AppEnv>();
  registerQuoteRoutes(app, {
    store: { latestQuote: async () => quote },
  } as AppDependencies);
  return app;
}

test("returns null when no quote has been received", async () => {
  const response = await appWithQuote(null).request(
    "http://server/api/quote/latest",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: null });
});

test("maps compact storage value to the public display amount", async () => {
  const response = await appWithQuote({
    id: 1,
    compactQuote: 95_900,
    announcedAt: new Date("2026-09-07T08:00:00.000Z"),
    receivedAt: new Date("2026-09-07T08:00:01.000Z"),
    sourceMessageId: 1,
    updatedAt: new Date("2026-09-07T08:00:01.000Z"),
  }).request("http://server/api/quote/latest");

  assert.deepEqual(await response.json(), {
    data: { quote: 95_900_000, announcedAt: "2026-09-07T08:00:00.000Z" },
  });
});

test("requires Telegram authentication", async () => {
  const app = createApp({
    authenticate: () => {
      throw new Error("ورود نامعتبر است.");
    },
    command: async () => {
      throw new Error("not called");
    },
    store: {
      latestQuote: async () => null,
      user: async () => ({ id: "user-1" }),
    } as unknown as AppDependencies["store"],
  });

  const response = await app.request("http://server/api/quote/latest");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: { code: "UNAUTHORIZED", message: "ورود نامعتبر است." },
  });
});
