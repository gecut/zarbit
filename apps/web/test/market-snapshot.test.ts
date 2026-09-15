import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSnapshot } from "@zarbit/contracts";
import {
  mergeMarketSnapshot,
  applyMarketEvent,
} from "../src/shared/api/merge-market-snapshot";

const quote = {
  compactPrice: 100000,
  announcedAt: "2026-09-15T10:00:00Z",
  sourceMessageId: 10,
};
const trade = {
  ...quote,
  id: "trade-20",
  quantity: 1,
  compactPrice: 100010,
  sourceMessageId: 20,
};
const snapshot: MarketSnapshot = {
  quote,
  trade,
  recentTrades: [trade],
  tradeQuoteDifference: 10,
  revision: 20,
  asOf: quote.announcedAt,
};

test("late snapshots cannot regress either stream; quote and trade IDs remain independent", () => {
  const merged = mergeMarketSnapshot(snapshot, {
    ...snapshot,
    quote: { ...quote, sourceMessageId: 15, compactPrice: 100005 },
    trade: { ...trade, sourceMessageId: 19, compactPrice: 99990 },
    recentTrades: [],
  });
  assert.equal(merged.trade?.sourceMessageId, 20);
  assert.equal(merged.quote?.sourceMessageId, 15);
  assert.equal(merged.tradeQuoteDifference, 5);
  assert.equal(merged.recentTrades[0]?.sourceMessageId, 20);
});

test("mock events and snapshots use the same monotonic trade merge", () => {
  const newer = applyMarketEvent(snapshot, {
    ...trade,
    type: "TRADE",
    id: "trade-21",
    sourceMessageId: 21,
    compactPrice: 100020,
    revision: 21,
  });
  const older = applyMarketEvent(newer, {
    ...trade,
    type: "TRADE",
    revision: 20,
  });
  assert.equal(older.trade?.sourceMessageId, 21);
  assert.deepEqual(
    older.recentTrades.map((t) => t.sourceMessageId),
    [21, 20],
  );
  assert.equal(older.tradeQuoteDifference, 20);
});
