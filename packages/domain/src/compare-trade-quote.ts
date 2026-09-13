export function compareTradeToQuote(
  tradeCompactPrice: number | null,
  quoteCompactPrice: number | null,
): number | null {
  if (tradeCompactPrice === null || quoteCompactPrice === null) return null;
  return tradeCompactPrice - quoteCompactPrice;
}
