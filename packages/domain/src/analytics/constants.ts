/**
 * Multiplier to convert compact price points per unit into nominal Tomans
 * Receipt/display prices are compact prices multiplied by 1000 and are
 * denominated in Tomans throughout the public product contract.
 */
export const RECEIPT_TOMAN_MULTIPLIER = 1_000;

/** Keep point arithmetic deterministic at the domain boundary. */
export function roundAnalyticsPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Default rolling analytics window duration in days. */
export const ROLLING_WINDOW_DAYS = 7;

/** Default rolling analytics window duration in milliseconds. */
export const ROLLING_WINDOW_MS = ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
