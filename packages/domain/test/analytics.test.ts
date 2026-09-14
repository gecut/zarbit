import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateParticipantAnalytics7D,
  calculatePositionTransition,
  createInitialPositionState,
  realizedPnlPointsToTomans,
  type ParticipantTrade,
} from "../src/analytics";

const start = new Date("2026-09-07T00:00:00Z");
const end = new Date("2026-09-14T00:00:00Z");
function trade(
  side: "BUY" | "SELL",
  quantity: number,
  compactPrice: number,
  announcedAt = start,
): ParticipantTrade {
  return Object.freeze({
    id: "fixture",
    sourceMessageId: 1,
    side,
    quantity,
    compactPrice,
    announcedAt,
  });
}
function replay(trades: readonly ParticipantTrade[]) {
  return calculateParticipantAnalytics7D({
    alias: "fixture",
    allTradesChronological: Object.freeze(trades),
    windowStart: start,
    windowEnd: end,
  });
}

test("reference ledger preserves inputs and unit metrics", () => {
  const trades = [
    trade("BUY", 1, 101800),
    trade("BUY", 1, 101450),
    trade("BUY", 1, 101050),
    trade("SELL", 2, 101800),
    trade("SELL", 1, 102000),
  ];
  const before = JSON.stringify(trades);
  const result = replay(trades);
  assert.equal(result.realizedPnlPoints, 1300);
  assert.equal(result.realizedPnlTomans, 30010619);
  assert.equal(result.observedPosition, 0);
  assert.equal(result.currentCostBasis, 0);
  assert.equal(result.totalVolume, 6);
  assert.equal(result.totalTrades, 5);
  assert.equal(result.buyVolume, 3);
  assert.equal(result.sellVolume, 3);
  assert.equal(JSON.stringify(trades), before);
});

test("fractional basis: split and single exits have identical final money", () => {
  for (const side of ["BUY", "SELL"] as const) {
    const exit = side === "BUY" ? "SELL" : "BUY";
    const opening = [trade(side, 2, 100), trade(side, 1, 101)];
    const single = replay([...opening, trade(exit, 3, 101)]);
    const split = replay([
      ...opening,
      trade(exit, 1, 101),
      trade(exit, 1, 101),
      trade(exit, 1, 101),
    ]);
    assert.equal(split.realizedPnlPoints, side === "BUY" ? 2 : -2);
    assert.equal(split.realizedPnlTomans, single.realizedPnlTomans);
    assert.equal(split.observedPosition, 0);
  }
});

test("partial closes, losses, break-even and crossings in both directions", () => {
  for (const side of ["BUY", "SELL"] as const) {
    const exit = side === "BUY" ? "SELL" : "BUY";
    const opened = calculatePositionTransition(
      createInitialPositionState(),
      trade(side, 2, 100),
    );
    assert.equal(opened.realizedPnlTomans, 0);
    const partial = calculatePositionTransition(
      opened.nextPosition,
      trade(exit, 1, 100),
    );
    assert.equal(partial.realizedPnlTomans, 0);
    assert.equal(partial.nextPosition.costBasis, 100);
    const crossing = calculatePositionTransition(
      opened.nextPosition,
      trade(exit, 3, 110),
    );
    assert.equal(crossing.closedQuantity, 2);
    assert.equal(crossing.openedQuantity, 1);
    assert.equal(crossing.isCrossing, true);
    assert.equal(crossing.nextPosition.costBasis, 110);
    assert.equal(crossing.nextPosition.netQuantity, side === "BUY" ? -1 : 1);
    assert.equal(
      crossing.unroundedRealizedPnlPoints,
      side === "BUY" ? 20 : -20,
    );
  }
});

test("history seeds basis, inclusive boundaries count, future trades do not", () => {
  const result = replay([
    trade("BUY", 1, 90, new Date(start.getTime() - 2)),
    trade("SELL", 1, 100, new Date(start.getTime() - 1)),
    trade("BUY", 2, 100, new Date(start.getTime() - 1)),
    trade("SELL", 1, 110, start),
    trade("SELL", 1, 120, end),
    trade("BUY", 100, 999, new Date(end.getTime() + 1)),
  ]);
  assert.equal(result.realizedPnlPoints, 30);
  assert.equal(result.realizedPnlTomans, realizedPnlPointsToTomans(30));
  assert.equal(result.totalTrades, 2);
  assert.equal(result.observedPosition, 0);
  assert.equal(replay([]).realizedPnlTomans, 0);
  assert.equal(replay([trade("BUY", 2, 100)]).realizedPnlTomans, 0);
});

test("conversion uses unrounded points and normalizes negative zero", () => {
  assert.equal(realizedPnlPointsToTomans(1300), 30010619);
  assert.equal(realizedPnlPointsToTomans(-1300), -30010619);
  assert.equal(Object.is(realizedPnlPointsToTomans(-0.000001), -0), false);
  const result = replay([
    trade("BUY", 2, 100),
    trade("BUY", 1, 101),
    trade("SELL", 1, 101),
  ]);
  assert.equal(result.realizedPnlPoints, 0.67);
  assert.equal(result.realizedPnlTomans, 15390);
  assert.notEqual(
    result.realizedPnlTomans,
    realizedPnlPointsToTomans(result.realizedPnlPoints),
  );
});
