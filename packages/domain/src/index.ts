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

/** Accepts a labelled compact quote surrounded by formatting or emoji. */
export function parseQuoteMessage(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = /(?:^|[^\p{L}])مظنه:[ \t]*(\d{4,})(?!\d)/u.exec(normalized);

  if (!match?.[1]) {
    return null;
  }

  const quote = Number(match[1].replace(/[,٬]/g, ""));
  return Number.isSafeInteger(quote) && quote > 0 && quote <= 2_147_483_647
    ? quote
    : null;
}
