/** Grams of 18-karat gold represented by one recorded trading unit. */
export const TRADE_UNIT_GRAMS = 100;

/** Converts a 17-karat mithqal quote to an 18-karat gram price. */
export const MITHQAL_TO_GRAM_18K_DIVISOR = 4.3318;

/** Converts compact quoted prices to nominal Tomans. */
export const RECEIPT_TOMAN_MULTIPLIER = 1_000;

/** Convert unrounded unit-weighted quote differences only at the output boundary. */
export function realizedPnlPointsToTomans(points: number): number {
  return (
    Math.round(
      ((points * TRADE_UNIT_GRAMS) / MITHQAL_TO_GRAM_18K_DIVISOR) *
        RECEIPT_TOMAN_MULTIPLIER,
    ) || 0
  );
}

/** Keep point arithmetic deterministic at the domain boundary. */
export function roundAnalyticsPoints(value: number): number {
  return Math.round(value * 100) / 100 || 0;
}

/** Default rolling analytics window duration in days. */
export const ROLLING_WINDOW_DAYS = 7;

/** Default rolling analytics window duration in milliseconds. */
export const ROLLING_WINDOW_MS = ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
