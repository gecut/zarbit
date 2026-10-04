import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateParticipantAnalytics7D,
  calculatePositionTransition,
  calculateSettlementTrades,
  createInitialPositionState,
} from "../src/index";

const at = (day: number) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`);

test("settlement closes long and short inventory with existing WACB transitions", () => {
  const positions = calculateSettlementTrades(
    [
      { participantId: "long", buyUnits: 5, sellUnits: 2 },
      { participantId: "short", buyUnits: 1, sellUnits: 4 },
      { participantId: "flat", buyUnits: 2, sellUnits: 2 },
    ],
    102_980,
  );
  assert.deepEqual(positions, [
    { participantId: "long", side: "SELL", quantity: 3, compactPrice: 102_980 },
    { participantId: "short", side: "BUY", quantity: 3, compactPrice: 102_980 },
  ]);

  const long = calculatePositionTransition(
    createInitialPositionState({ hasZeroCrossing: true }),
    {
      id: "buy",
      sourceMessageId: 11,
      side: "BUY",
      quantity: 3,
      compactPrice: 100_000,
      announcedAt: at(20),
    },
  ).nextPosition;
  const closedLong = calculatePositionTransition(long, {
    id: "settle-long",
    sourceMessageId: 20,
    side: "SELL",
    quantity: 3,
    compactPrice: 102_980,
    announcedAt: at(21),
    type: "SETTLEMENT",
  });
  assert.equal(closedLong.nextPosition.netQuantity, 0);
  assert.equal(closedLong.nextPosition.costBasis, 0);
  assert.equal(closedLong.unroundedRealizedPnlPoints, 8_940);

  const short = calculatePositionTransition(
    createInitialPositionState({ hasZeroCrossing: true }),
    {
      id: "sell",
      sourceMessageId: 12,
      side: "SELL",
      quantity: 3,
      compactPrice: 105_000,
      announcedAt: at(20),
    },
  ).nextPosition;
  const closedShort = calculatePositionTransition(short, {
    id: "settle-short",
    sourceMessageId: 20,
    side: "BUY",
    quantity: 3,
    compactPrice: 102_980,
    announcedAt: at(21),
    type: "SETTLEMENT",
  });
  assert.equal(closedShort.nextPosition.netQuantity, 0);
  assert.equal(closedShort.nextPosition.costBasis, 0);
  assert.equal(closedShort.unroundedRealizedPnlPoints, 6_060);
});

test("bootstrap excludes old inventory but retains observed seven-day volume", () => {
  const result = calculateParticipantAnalytics7D({
    alias: "participant",
    baselineMessageId: 20,
    coverageVerified: false,
    windowStart: at(18),
    windowEnd: at(24),
    earliestSystemDate: at(18),
    allTradesChronological: [
      {
        id: "old",
        sourceMessageId: 10,
        side: "BUY",
        quantity: 5,
        compactPrice: 90_000,
        announcedAt: at(19),
        type: "NORMAL",
      },
      {
        id: "new",
        sourceMessageId: 21,
        side: "BUY",
        quantity: 2,
        compactPrice: 100_000,
        announcedAt: at(22),
        type: "NORMAL",
      },
      {
        id: "close",
        sourceMessageId: 30,
        side: "SELL",
        quantity: 2,
        compactPrice: 102_000,
        announcedAt: at(23),
        type: "SETTLEMENT",
      },
    ],
  });
  assert.equal(result.observedPosition, 0);
  assert.equal(result.currentCostBasis, 0);
  assert.equal(result.totalTrades, 3);
  assert.equal(result.contributions.normal.buyVolume, 7);
  assert.equal(result.contributions.settlement.sellVolume, 2);
  assert.equal(result.realizedPnlPoints, 4_000);
  assert.equal(
    result.contributions.total.realizedPnlTomans,
    result.contributions.normal.realizedPnlTomans +
      result.contributions.settlement.realizedPnlTomans,
  );
  assert.equal(result.confidence, "ESTIMATED");
});
