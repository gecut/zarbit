import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import type { AppDependencies, AppEnv } from "../src/app-types";
import { createApp } from "../src/app";
import { registerQuoteRoutes } from "../src/quote-routes";

function appWithQuote(
  quote: Awaited<ReturnType<AppDependencies["store"]["latestQuote"]>>,
  points: Awaited<ReturnType<AppDependencies["store"]["quotesSince"]>> = [],
) {
  const app = new Hono<AppEnv>();
  registerQuoteRoutes(app, {
    store: {
      latestQuote: async () => quote,
      quotesSince: async () => points,
    },
  } as unknown as AppDependencies);
  return app;
}

test("returns null when no quote has been received", async () => {
  const response = await appWithQuote(null).request(
    "http://server/api/quote/latest",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: null });
});

test("returns a three-day dashboard with compact amounts", async () => {
  const response = await appWithQuote(
    {
      id: 1,
      compactQuote: 96_120,
      announcedAt: new Date("2026-09-07T08:00:00.000Z"),
      receivedAt: new Date("2026-09-07T08:00:01.000Z"),
      sourceMessageId: 3,
      createdAt: new Date("2026-09-07T08:00:01.000Z"),
    },
    [
      {
        id: 1,
        compactQuote: 95_900,
        announcedAt: new Date("2026-09-06T08:00:00.000Z"),
        receivedAt: new Date("2026-09-06T08:00:01.000Z"),
        sourceMessageId: 2,
        createdAt: new Date("2026-09-06T08:00:01.000Z"),
      },
      {
        id: 2,
        compactQuote: 96_120,
        announcedAt: new Date("2026-09-07T08:00:00.000Z"),
        receivedAt: new Date("2026-09-07T08:00:01.000Z"),
        sourceMessageId: 3,
        createdAt: new Date("2026-09-07T08:00:01.000Z"),
      },
    ],
  ).request("http://server/api/quote/dashboard");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      latest: {
        quote: 96_120,
        announcedAt: "2026-09-07T08:00:00.000Z",
      },
      points: [
        {
          quote: 95_900,
          announcedAt: "2026-09-06T08:00:00.000Z",
        },
        {
          quote: 96_120,
          announcedAt: "2026-09-07T08:00:00.000Z",
        },
      ],
    },
  });
});

test("returns an empty dashboard before the first quote", async () => {
  const response = await appWithQuote(null).request(
    "http://server/api/quote/dashboard",
  );
  assert.deepEqual(await response.json(), {
    data: { latest: null, points: [] },
  });
});

test("returns the compact storage value from the quote API", async () => {
  const response = await appWithQuote({
    id: 1,
    compactQuote: 95_900,
    announcedAt: new Date("2026-09-07T08:00:00.000Z"),
    receivedAt: new Date("2026-09-07T08:00:01.000Z"),
    sourceMessageId: 1,
    createdAt: new Date("2026-09-07T08:00:01.000Z"),
  }).request("http://server/api/quote/latest");

  assert.deepEqual(await response.json(), {
    data: { quote: 95_900, announcedAt: "2026-09-07T08:00:00.000Z" },
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

  for (const path of ["/api/quote/latest", "/api/quote/dashboard"]) {
    const response = await app.request(`http://server${path}`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: { code: "UNAUTHORIZED", message: "ورود نامعتبر است." },
    });
  }
});
