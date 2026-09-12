import { RECEIPT_TOMAN_MULTIPLIER, roundAnalyticsPoints } from "./constants";
import type { ParticipantTrade, PositionState, TradeTransition } from "./types";

/**
 * Creates a clean initial position state before processing a stream of trades.
 * By default, hasZeroCrossing is false until the participant hits netQuantity = 0
 * or crosses zero during the observed trade history.
 */
export function createInitialPositionState(options?: {
  hasZeroCrossing?: boolean;
}): PositionState {
  return {
    netQuantity: 0,
    costBasis: 0,
    hasZeroCrossing: options?.hasZeroCrossing ?? false,
    unmatchedUnits: 0,
  };
}

/**
 * Computes the state transition and realized P&L when a trade is applied to a position.
 * Applies Signed Weighted-Average Cost Basis (WACB) and handles position crossings atomically.
 */
export function calculatePositionTransition(
  current: PositionState,
  trade: ParticipantTrade,
): TradeTransition {
  const { quantity: q, compactPrice: p, side } = trade;
  if (q <= 0) {
    throw new Error(`Trade quantity must be greater than zero, received: ${q}`);
  }

  const prevQ = current.netQuantity;
  const prevC = current.costBasis;
  const hadZero = current.hasZeroCrossing;
  const prevUnmatched = current.unmatchedUnits;

  // Case 1: Currently Flat (netQuantity === 0)
  if (prevQ === 0) {
    const nextQ = side === "BUY" ? q : -q;
    const nextPosition: PositionState = {
      netQuantity: nextQ,
      costBasis: p,
      hasZeroCrossing: hadZero,
      unmatchedUnits: prevUnmatched,
    };

    return {
      previousPosition: current,
      nextPosition,
      trade,
      realizedPnlPoints: 0,
      realizedPnlTomans: 0,
      closedQuantity: 0,
      openedQuantity: q,
      isCrossing: false,
    };
  }

  // Case 2: Currently Long (netQuantity > 0)
  if (prevQ > 0) {
    if (side === "BUY") {
      // Adding to Long: update weighted-average cost basis
      const nextQ = prevQ + q;
      const nextC = (prevQ * prevC + q * p) / nextQ;
      const nextPosition: PositionState = {
        netQuantity: nextQ,
        costBasis: nextC,
        hasZeroCrossing: hadZero,
        unmatchedUnits: prevUnmatched,
      };

      return {
        previousPosition: current,
        nextPosition,
        trade,
        realizedPnlPoints: 0,
        realizedPnlTomans: 0,
        closedQuantity: 0,
        openedQuantity: q,
        isCrossing: false,
      };
    }

    // Side is SELL: reducing Long
    if (q <= prevQ) {
      // Partial or Full close of Long
      const nextQ = prevQ - q;
      const realizedPnlPoints = roundAnalyticsPoints(q * (p - prevC));
      const realizedPnlTomans = Math.round(
        realizedPnlPoints * RECEIPT_TOMAN_MULTIPLIER,
      );
      const isFlat = nextQ === 0;

      const nextPosition: PositionState = {
        netQuantity: nextQ,
        costBasis: isFlat ? 0 : prevC,
        hasZeroCrossing: hadZero || isFlat,
        unmatchedUnits: prevUnmatched,
      };

      return {
        previousPosition: current,
        nextPosition,
        trade,
        realizedPnlPoints,
        realizedPnlTomans,
        closedQuantity: q,
        openedQuantity: 0,
        isCrossing: false,
      };
    }

    // q > prevQ: Crossing Long -> Short
    // Atomic split: close all prevQ at p, open (q - prevQ) Short at p
    const closedQty = prevQ;
    const openedQty = q - prevQ;
    const realizedPnlPoints = roundAnalyticsPoints(closedQty * (p - prevC));
    const realizedPnlTomans = Math.round(
      realizedPnlPoints * RECEIPT_TOMAN_MULTIPLIER,
    );

    const nextPosition: PositionState = {
      netQuantity: -openedQty,
      costBasis: p,
      hasZeroCrossing: true, // definitely touched 0 during crossing
      unmatchedUnits: prevUnmatched,
    };

    return {
      previousPosition: current,
      nextPosition,
      trade,
      realizedPnlPoints,
      realizedPnlTomans,
      closedQuantity: closedQty,
      openedQuantity: openedQty,
      isCrossing: true,
    };
  }

  // Case 3: Currently Short (netQuantity < 0)
  const shortQty = Math.abs(prevQ);

  if (side === "SELL") {
    // Adding to Short: update weighted-average cost basis
    const nextShortQty = shortQty + q;
    const nextC = (shortQty * prevC + q * p) / nextShortQty;
    const nextPosition: PositionState = {
      netQuantity: -nextShortQty,
      costBasis: nextC,
      hasZeroCrossing: hadZero,
      unmatchedUnits: prevUnmatched,
    };

    return {
      previousPosition: current,
      nextPosition,
      trade,
      realizedPnlPoints: 0,
      realizedPnlTomans: 0,
      closedQuantity: 0,
      openedQuantity: q,
      isCrossing: false,
    };
  }

  // Side is BUY: reducing Short
  if (q <= shortQty) {
    // Partial or Full close of Short
    const nextShortQty = shortQty - q;
    const realizedPnlPoints = roundAnalyticsPoints(q * (prevC - p));
    const realizedPnlTomans = Math.round(
      realizedPnlPoints * RECEIPT_TOMAN_MULTIPLIER,
    );
    const isFlat = nextShortQty === 0;

    const nextPosition: PositionState = {
      netQuantity: isFlat ? 0 : -nextShortQty,
      costBasis: isFlat ? 0 : prevC,
      hasZeroCrossing: hadZero || isFlat,
      unmatchedUnits: prevUnmatched,
    };

    return {
      previousPosition: current,
      nextPosition,
      trade,
      realizedPnlPoints,
      realizedPnlTomans,
      closedQuantity: q,
      openedQuantity: 0,
      isCrossing: false,
    };
  }

  // q > shortQty: Crossing Short -> Long
  // Atomic split: close all shortQty at p, open (q - shortQty) Long at p
  const closedQty = shortQty;
  const openedQty = q - shortQty;
  const realizedPnlPoints = roundAnalyticsPoints(closedQty * (prevC - p));
  const realizedPnlTomans = Math.round(
    realizedPnlPoints * RECEIPT_TOMAN_MULTIPLIER,
  );

  const nextPosition: PositionState = {
    netQuantity: openedQty,
    costBasis: p,
    hasZeroCrossing: true, // definitely touched 0 during crossing
    unmatchedUnits: prevUnmatched,
  };

  return {
    previousPosition: current,
    nextPosition,
    trade,
    realizedPnlPoints,
    realizedPnlTomans,
    closedQuantity: closedQty,
    openedQuantity: openedQty,
    isCrossing: true,
  };
}
