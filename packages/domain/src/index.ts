export {
  normalizeArabicPersianLetters,
  normalizeCompactText,
  normalizeProtocolText,
  stripBidiAndControlChars,
  toAsciiDigits,
} from "./normalize";
export { parseCanonicalBotOrder } from "./parse-canonical-bot-order";
export { parseCanonicalBotQuote } from "./parse-canonical-bot-quote";
export { parseContextCommand } from "./parse-context-command";
export {
  parseHumanOrder,
  type ParseHumanOrderOptions,
} from "./parse-human-order";
export { parseTradeReceipt } from "./parse-trade-receipt";
export { resolvePriceAgainstQuote } from "./price-resolver";
export type {
  CanonicalBotOrder,
  CanonicalBotQuote,
  ContextCommandIntent,
  HumanOrderIntent,
  ParseResult,
  ParseResultStatus,
  PriceResolution,
  TradeReceipt,
  TradingSide,
} from "./types";

export const compactQuoteMultiplier = 1_000;

export function compactQuoteToDisplayPrice(compactQuote: number): number {
  if (!Number.isSafeInteger(compactQuote) || compactQuote <= 0) {
    throw new Error("قیمت نامعتبر است.");
  }

  const displayPrice = compactQuote * compactQuoteMultiplier;
  if (!Number.isSafeInteger(displayPrice)) {
    throw new Error("قیمت نامعتبر است.");
  }

  return displayPrice;
}

export function matchesRequest(
  condition: "GTE" | "LTE",
  targetPrice: number,
  quote: number,
): boolean {
  return condition === "GTE" ? quote >= targetPrice : quote <= targetPrice;
}

export function isFreshQuote(announcedAt: Date, receivedAt: Date): boolean {
  const age = receivedAt.getTime() - announcedAt.getTime();
  return age >= 0 && age <= 60_000;
}

export function formatGroupMessage(
  action: "BUY" | "SELL",
  units: number,
  quote: number,
): string {
  if (
    ![units, quote].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 2_147_483_647,
    )
  )
    throw new Error("قیمت یا تعداد نامعتبر است.");
  return `${units}${action === "BUY" ? "خ" : "ف"}${quote}`;
}
