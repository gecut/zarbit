/**
 * Multiplier to convert compact price points per unit into nominal Tomans
 * based on receipt mechanics (rawPrice = compactPrice * 1000 Rials = compactPrice * 100 Tomans).
 * 1 point delta for 1 unit = 100 Tomans nominal value.
 */
export const RECEIPT_TOMAN_MULTIPLIER = 100;

/** Default rolling analytics window duration in days. */
export const ROLLING_WINDOW_DAYS = 7;

/** Default rolling analytics window duration in milliseconds. */
export const ROLLING_WINDOW_MS = ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
