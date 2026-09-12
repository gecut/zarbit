import assert from "node:assert/strict";
import test from "node:test";
import { calculateParticipantAnalytics7D } from "../src/analytics/calculate-participant-analytics";
import type { ParticipantTrade } from "../src/analytics/types";

const windowStart = new Date("2026-09-03T00:00:00Z");
const windowEnd = new Date("2026-09-10T00:00:00Z");

test("trades strictly before window set opening position without adding 7D volume", () => {
  const trades: ParticipantTrade[] = [
    {
      id: "t1",
      sourceMessageId: 1,
      side: "BUY",
      quantity: 5,
      compactPrice: 105_000,
      announcedAt: new Date("2026-08-25T10:00:00Z"), // 9 days before windowEnd
    },
  ];

  const result = calculateParticipantAnalytics7D({
    alias: "سناتور",
    allTradesChronological: trades,
    windowStart,
    windowEnd,
  });

  assert.equal(result.alias, "سناتور");
  assert.equal(result.totalVolume, 0);
  assert.equal(result.totalTrades, 0);
  assert.equal(result.realizedPnlPoints, 0);
  assert.equal(result.realizedPnlTomans, 0);
  assert.equal(result.observedPosition, 5);
  assert.equal(result.currentCostBasis, 105_000);
  assert.equal(result.totalObservedTrades, 1);
});

test("pre-window trades establish cost basis for in-window realized P&L", () => {
  // Day -9: Buy 2 @ 105,000 (pre-window)
  // Day -5: Sell 1 @ 105,300 (in-window) -> Realized P&L = +300 points
  // Day -2: Sell 1 @ 105,400 (in-window) -> Realized P&L = +400 points
  const trades: ParticipantTrade[] = [
    {
      id: "t1",
      sourceMessageId: 1,
      side: "BUY",
      quantity: 2,
      compactPrice: 105_000,
      announcedAt: new Date("2026-09-01T12:00:00Z"), // Before windowStart
    },
    {
      id: "t2",
      sourceMessageId: 2,
      side: "SELL",
      quantity: 1,
      compactPrice: 105_300,
      announcedAt: new Date("2026-09-05T12:00:00Z"), // In window
    },
    {
      id: "t3",
      sourceMessageId: 3,
      side: "SELL",
      quantity: 1,
      compactPrice: 105_400,
      announcedAt: new Date("2026-09-08T12:00:00Z"), // In window
    },
  ];

  const result = calculateParticipantAnalytics7D({
    alias: "مرداد",
    allTradesChronological: trades,
    windowStart,
    windowEnd,
    earliestSystemDate: new Date("2026-09-01T00:00:00Z"),
  });

  assert.equal(result.alias, "مرداد");
  assert.equal(result.totalVolume, 2);
  assert.equal(result.buyVolume, 0);
  assert.equal(result.sellVolume, 2);
  assert.equal(result.totalTrades, 2);
  assert.equal(result.buyTrades, 0);
  assert.equal(result.sellTrades, 2);
  assert.equal(result.averageTradeSize, 1);
  assert.equal(result.realizedPnlPoints, 700);
  assert.equal(result.realizedPnlTomans, 70_000);
  assert.equal(result.observedPosition, 0);
  assert.equal(result.currentCostBasis, 0);
  assert.equal(result.hasZeroCrossing, true);
  assert.equal(result.confidence, "HIGH");
});

test("evaluates confidence as ESTIMATED when history is shorter than 7 days", () => {
  const trades: ParticipantTrade[] = [
    {
      id: "t1",
      sourceMessageId: 1,
      side: "BUY",
      quantity: 2,
      compactPrice: 105_000,
      announcedAt: new Date("2026-09-08T10:00:00Z"),
    },
    {
      id: "t2",
      sourceMessageId: 2,
      side: "SELL",
      quantity: 2,
      compactPrice: 105_200,
      announcedAt: new Date("2026-09-09T10:00:00Z"),
    },
  ];

  const result = calculateParticipantAnalytics7D({
    alias: "تاجر_جدید",
    allTradesChronological: trades,
    windowStart,
    windowEnd,
    earliestSystemDate: new Date("2026-09-08T00:00:00Z"), // Only 2 days old
  });

  assert.equal(result.observedPosition, 0);
  assert.equal(result.hasZeroCrossing, true);
  // Despite hitting zero, history span is < 7 days -> ESTIMATED
  assert.equal(result.confidence, "ESTIMATED");
});

test("handles crossing positions within the 7-day window", () => {
  // Buy 1 @ 105,000, then Sell 3 @ 105,200 (crossing Long 1 -> Short 2)
  // Leg 1: Close Long 1 @ 105,200 -> P&L = +200 points
  // Leg 2: Open Short 2 @ 105,200
  const trades: ParticipantTrade[] = [
    {
      id: "t1",
      sourceMessageId: 1,
      side: "BUY",
      quantity: 1,
      compactPrice: 105_000,
      announcedAt: new Date("2026-09-04T10:00:00Z"),
    },
    {
      id: "t2",
      sourceMessageId: 2,
      side: "SELL",
      quantity: 3,
      compactPrice: 105_200,
      announcedAt: new Date("2026-09-06T10:00:00Z"),
    },
  ];

  const result = calculateParticipantAnalytics7D({
    alias: "اسکان",
    allTradesChronological: trades,
    windowStart,
    windowEnd,
    earliestSystemDate: new Date("2026-08-01T00:00:00Z"),
  });

  assert.equal(result.totalVolume, 4);
  assert.equal(result.buyVolume, 1);
  assert.equal(result.sellVolume, 3);
  assert.equal(result.totalTrades, 2);
  assert.equal(result.averageTradeSize, 2);
  assert.equal(result.realizedPnlPoints, 200);
  assert.equal(result.realizedPnlTomans, 20_000);
  assert.equal(result.observedPosition, -2);
  assert.equal(result.currentCostBasis, 105_200);
  assert.equal(result.hasZeroCrossing, true);
  assert.equal(result.confidence, "HIGH");
});
