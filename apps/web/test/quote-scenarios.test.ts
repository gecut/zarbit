import assert from "node:assert/strict";
import test from "node:test";

import {
  createQuoteDashboard,
  getQuoteScenario,
} from "../src/dev/quote-scenarios";

test("selects each supported quote mock scenario from the URL", () => {
  assert.equal(getQuoteScenario("?quoteScenario=empty"), "empty");
  assert.equal(getQuoteScenario("?quoteScenario=loading"), "loading");
  assert.equal(getQuoteScenario("?quoteScenario=stale"), "stale");
  assert.equal(getQuoteScenario("?quoteScenario=error"), "error");
  assert.equal(getQuoteScenario("?quoteScenario=unknown"), "normal");
});

test("creates deterministic normal, stale, and empty dashboard data", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  const normal = createQuoteDashboard("normal", now);
  assert.equal(normal.points.length, 6);
  assert.equal(normal.points[0]?.quote, 95_820);
  assert.equal(normal.latest?.quote, 96_120);
  assert.equal(normal.latest?.announcedAt, "2026-09-07T11:58:00.000Z");
  assert.equal(normal.latestTrade?.price, 96_100);

  const stale = createQuoteDashboard("stale", now);
  assert.equal(stale.latest?.announcedAt, "2026-09-07T11:54:00.000Z");
  assert.equal(stale.latestTrade?.price, 96_100);
  assert.deepEqual(createQuoteDashboard("empty", now), {
    latest: null,
    points: [],
  });
});

test("provides distinct concepts for official quote and executed trade", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  const dashboard = createQuoteDashboard("normal", now);
  assert.ok(dashboard.latest, "latest quote must be present");
  assert.ok(dashboard.latestTrade, "latest trade must be present");
  assert.notEqual(dashboard.latest.quote, dashboard.latestTrade.price);
  assert.notEqual(
    dashboard.latest.announcedAt,
    dashboard.latestTrade.announcedAt,
  );
});
