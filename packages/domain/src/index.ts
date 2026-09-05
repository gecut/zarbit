export const compactQuoteMultiplier = 1_000;

export type RequestAction = "ALERT" | "BUY" | "SELL";
export type RequestCondition = "LTE" | "GTE";

export function humanPriceToCompactQuote(humanPrice: number): number {
  if (
    !Number.isSafeInteger(humanPrice) ||
    humanPrice <= 0 ||
    humanPrice % compactQuoteMultiplier !== 0
  ) {
    throw new Error("قیمت باید مضربی از ۱٬۰۰۰ باشد.");
  }

  return humanPrice / compactQuoteMultiplier;
}

export function compactQuoteToHumanPrice(compactQuote: number): number {
  if (!Number.isSafeInteger(compactQuote) || compactQuote <= 0) {
    throw new Error("قیمت نامعتبر است.");
  }

  const humanPrice = compactQuote * compactQuoteMultiplier;
  if (!Number.isSafeInteger(humanPrice)) {
    throw new Error("قیمت نامعتبر است.");
  }

  return humanPrice;
}

export function formatHumanPrice(compactQuote: number): string {
  return new Intl.NumberFormat("fa-IR").format(
    compactQuoteToHumanPrice(compactQuote),
  );
}

/** Accepts only a standalone compact quote, optionally with the known Persian label. */
export function parseQuoteMessage(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match =
    /^(?:مظنه[ \t]*[:：-]?[ \t]*)?(\d{4,}|\d{1,3}(?:[,٬]\d{3})+)$/u.exec(
      normalized,
    );

  if (!match?.[1]) {
    return null;
  }

  const quote = Number(match[1].replace(/[,٬]/g, ""));
  return Number.isSafeInteger(quote) && quote > 0 && quote <= 2_147_483_647
    ? quote
    : null;
}

export function requestMatchesQuote(
  condition: RequestCondition,
  targetPrice: number,
  quote: number,
): boolean {
  return condition === "LTE" ? quote <= targetPrice : quote >= targetPrice;
}

export function buildTradeMessage(input: {
  action: Extract<RequestAction, "BUY" | "SELL">;
  units: number;
  quote: number;
}): string {
  const side = input.action === "BUY" ? "خ" : "ف";
  return `${input.units}${side}${input.quote}`;
}

export function buildAlertMessage(input: {
  quote: number;
  targetPrice: number;
}): string {
  return `هشدار قیمت: مظنه به ${formatHumanPrice(input.quote)} رسید. هدف شما ${formatHumanPrice(input.targetPrice)} بود.`;
}

export function buildTradeSuccessMessage(input: {
  action: Extract<RequestAction, "BUY" | "SELL">;
  units: number;
  quote: number;
}): string {
  const action = input.action === "BUY" ? "خرید" : "فروش";
  return `${action} ${input.units} واحد با مظنه ${formatHumanPrice(input.quote)} با موفقیت ارسال شد.`;
}

export function buildTradeFailureMessage(): string {
  return "درخواست ناموفق شد؛ نتیجه ارسال ممکن است نامشخص باشد. پیش از ثبت دوباره، پیام‌های گروه را بررسی کنید.";
}
