import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePositionTransition,
  createInitialPositionState,
} from "../src/analytics/calculate-position";
import type { ParticipantTrade } from "../src/analytics/types";

function mockTrade(
  partial: Partial<ParticipantTrade> & {
    side: "BUY" | "SELL";
    quantity: number;
    compactPrice: number;
  },
): ParticipantTrade {
  return {
    id: "trade-1",
    sourceMessageId: 100,
    announcedAt: new Date("2026-09-10T10:00:00Z"),
    ...partial,
  };
}

test("initializes flat position state correctly", () => {
  const initial = createInitialPositionState();
  assert.equal(initial.netQuantity, 0);
  assert.equal(initial.costBasis, 0);
  assert.equal(initial.hasZeroCrossing, false);
});

test("flat position opening long", () => {
  const initial = createInitialPositionState();
  const trade = mockTrade({ side: "BUY", quantity: 2, compactPrice: 105_000 });
  const transition = calculatePositionTransition(initial, trade);

  assert.equal(transition.nextPosition.netQuantity, 2);
  assert.equal(transition.nextPosition.costBasis, 105_000);
  assert.equal(transition.realizedPnlPoints, 0);
  assert.equal(transition.realizedPnlTomans, 0);
  assert.equal(transition.closedQuantity, 0);
  assert.equal(transition.openedQuantity, 2);
  assert.equal(transition.isCrossing, false);
});

test("flat position opening short", () => {
  const initial = createInitialPositionState();
  const trade = mockTrade({ side: "SELL", quantity: 3, compactPrice: 105_200 });
  const transition = calculatePositionTransition(initial, trade);

  assert.equal(transition.nextPosition.netQuantity, -3);
  assert.equal(transition.nextPosition.costBasis, 105_200);
  assert.equal(transition.realizedPnlPoints, 0);
  assert.equal(transition.realizedPnlTomans, 0);
  assert.equal(transition.closedQuantity, 0);
  assert.equal(transition.openedQuantity, 3);
  assert.equal(transition.isCrossing, false);
});

test("adding to existing long updates weighted-average cost basis", () => {
  // Initial: Long 1 unit @ 105,000
  const current = {
    netQuantity: 1,
    costBasis: 105_000,
    hasZeroCrossing: false,
    unmatchedUnits: 0,
  };
  // Buy 2 units @ 105,300 -> (1*105000 + 2*105300) / 3 = 315600 / 3 = 105,200
  const trade = mockTrade({ side: "BUY", quantity: 2, compactPrice: 105_300 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, 3);
  assert.equal(transition.nextPosition.costBasis, 105_200);
  assert.equal(transition.realizedPnlPoints, 0);
  assert.equal(transition.closedQuantity, 0);
  assert.equal(transition.openedQuantity, 2);
});

test("partial close of long realizes P&L and preserves cost basis", () => {
  // Initial: Long 3 units @ 105,200
  const current = {
    netQuantity: 3,
    costBasis: 105_200,
    hasZeroCrossing: false,
    unmatchedUnits: 0,
  };
  // Sell 1 unit @ 105,400 -> Profit = 1 * (105,400 - 105,200) = +200 points = +20,000 Tomans
  const trade = mockTrade({ side: "SELL", quantity: 1, compactPrice: 105_400 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, 2);
  assert.equal(transition.nextPosition.costBasis, 105_200);
  assert.equal(transition.realizedPnlPoints, 200);
  assert.equal(transition.realizedPnlTomans, 20_000);
  assert.equal(transition.closedQuantity, 1);
  assert.equal(transition.openedQuantity, 0);
  assert.equal(transition.isCrossing, false);
});

test("full close of long resets cost basis to 0 and records zero crossing", () => {
  // Initial: Long 2 units @ 105,200
  const current = {
    netQuantity: 2,
    costBasis: 105_200,
    hasZeroCrossing: false,
    unmatchedUnits: 0,
  };
  // Sell 2 units @ 105,100 -> Loss = 2 * (105,100 - 105,200) = -200 points = -20,000 Tomans
  const trade = mockTrade({ side: "SELL", quantity: 2, compactPrice: 105_100 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, 0);
  assert.equal(transition.nextPosition.costBasis, 0);
  assert.equal(transition.nextPosition.hasZeroCrossing, true);
  assert.equal(transition.realizedPnlPoints, -200);
  assert.equal(transition.realizedPnlTomans, -20_000);
  assert.equal(transition.closedQuantity, 2);
  assert.equal(transition.openedQuantity, 0);
});

test("crossing from long to short splits into closing and opening legs", () => {
  // Initial: Long 2 units @ 105,000
  const current = {
    netQuantity: 2,
    costBasis: 105_000,
    hasZeroCrossing: false,
    unmatchedUnits: 0,
  };
  // Sell 5 units @ 105,300:
  // Leg 1: Close Long 2 @ 105,300 -> P&L = 2 * (105,300 - 105,000) = +600 points = +60,000 Tomans
  // Leg 2: Open Short 3 @ 105,300 -> New Short 3 @ basis 105,300
  const trade = mockTrade({ side: "SELL", quantity: 5, compactPrice: 105_300 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, -3);
  assert.equal(transition.nextPosition.costBasis, 105_300);
  assert.equal(transition.nextPosition.hasZeroCrossing, true);
  assert.equal(transition.realizedPnlPoints, 600);
  assert.equal(transition.realizedPnlTomans, 60_000);
  assert.equal(transition.closedQuantity, 2);
  assert.equal(transition.openedQuantity, 3);
  assert.equal(transition.isCrossing, true);
});

test("adding to existing short updates weighted-average cost basis", () => {
  // Initial: Short 2 units @ 105,400
  const current = {
    netQuantity: -2,
    costBasis: 105_400,
    hasZeroCrossing: true,
    unmatchedUnits: 0,
  };
  // Sell 2 units @ 105,000 -> (2*105400 + 2*105000) / 4 = 420800 / 4 = 105,200
  const trade = mockTrade({ side: "SELL", quantity: 2, compactPrice: 105_000 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, -4);
  assert.equal(transition.nextPosition.costBasis, 105_200);
  assert.equal(transition.realizedPnlPoints, 0);
  assert.equal(transition.closedQuantity, 0);
  assert.equal(transition.openedQuantity, 2);
});

test("partial close of short realizes P&L and preserves cost basis", () => {
  // Initial: Short 4 units @ 105,200
  const current = {
    netQuantity: -4,
    costBasis: 105_200,
    hasZeroCrossing: true,
    unmatchedUnits: 0,
  };
  // Buy 2 units @ 105,050 -> Profit = 2 * (105,200 - 105,050) = +300 points = +30,000 Tomans
  const trade = mockTrade({ side: "BUY", quantity: 2, compactPrice: 105_050 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, -2);
  assert.equal(transition.nextPosition.costBasis, 105_200);
  assert.equal(transition.realizedPnlPoints, 300);
  assert.equal(transition.realizedPnlTomans, 30_000);
  assert.equal(transition.closedQuantity, 2);
  assert.equal(transition.openedQuantity, 0);
  assert.equal(transition.isCrossing, false);
});

test("full close of short resets cost basis to 0 and records zero crossing", () => {
  // Initial: Short 2 units @ 105,200
  const current = {
    netQuantity: -2,
    costBasis: 105_200,
    hasZeroCrossing: false,
    unmatchedUnits: 0,
  };
  // Buy 2 units @ 105,350 -> Loss = 2 * (105,200 - 105,350) = -300 points = -30,000 Tomans
  const trade = mockTrade({ side: "BUY", quantity: 2, compactPrice: 105_350 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, 0);
  assert.equal(transition.nextPosition.costBasis, 0);
  assert.equal(transition.nextPosition.hasZeroCrossing, true);
  assert.equal(transition.realizedPnlPoints, -300);
  assert.equal(transition.realizedPnlTomans, -30_000);
  assert.equal(transition.closedQuantity, 2);
  assert.equal(transition.openedQuantity, 0);
});

test("crossing from short to long splits into closing and opening legs", () => {
  // Initial: Short 1 unit @ 105,300
  const current = {
    netQuantity: -1,
    costBasis: 105_300,
    hasZeroCrossing: false,
    unmatchedUnits: 0,
  };
  // Buy 4 units @ 105,000:
  // Leg 1: Close Short 1 @ 105,000 -> P&L = 1 * (105,300 - 105,000) = +300 points = +30,000 Tomans
  // Leg 2: Open Long 3 @ 105,000 -> New Long 3 @ basis 105,000
  const trade = mockTrade({ side: "BUY", quantity: 4, compactPrice: 105_000 });
  const transition = calculatePositionTransition(current, trade);

  assert.equal(transition.nextPosition.netQuantity, 3);
  assert.equal(transition.nextPosition.costBasis, 105_000);
  assert.equal(transition.nextPosition.hasZeroCrossing, true);
  assert.equal(transition.realizedPnlPoints, 300);
  assert.equal(transition.realizedPnlTomans, 30_000);
  assert.equal(transition.closedQuantity, 1);
  assert.equal(transition.openedQuantity, 3);
  assert.equal(transition.isCrossing, true);
});

test("rejects non-positive trade quantities", () => {
  const current = createInitialPositionState();
  assert.throws(
    () =>
      calculatePositionTransition(
        current,
        mockTrade({ side: "BUY", quantity: 0, compactPrice: 105_000 }),
      ),
    /Trade quantity must be greater than zero/,
  );
});
