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
