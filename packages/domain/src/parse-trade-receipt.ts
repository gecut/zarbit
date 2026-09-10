import { normalizeProtocolText } from "./normalize";
import type { ParseResult, TradeReceipt } from "./types";

const BUYER_LINE_REGEX = /(?:🔵|\u{1F535})?\s*خریدار\s*:\s*(.+)$/u;
const SELLER_LINE_REGEX = /(?:🔴|\u{1F534})?\s*فروشنده\s*:\s*(.+)$/u;
const EXECUTION_LINE_REGEX =
  /(?:✅|\u{2705})?\s*تعداد:\s*(\d+)\s*قیمت:\s*([\d,٬]+)\s*(?:✅|\u{2705})?$/u;
const TIME_LINE_REGEX = /(?:⏱️|⏱|\u{23F1}\u{FE0F}|\u{23F1})?\s*ساعت:\s*(.+)$/u;
const REFERENCE_LINE_REGEX = /(?:🔖|\u{1F516})?\s*شماره\s*حواله:\s*(.+)$/u;

/**
 * Parses authoritative bot trade receipts ("حواله").
 *
 * Example format:
 * .
 * 🔵 خریدار : مرداد
 * 🔴 فروشنده : سناتور
 * ✅ تعداد: 2 قیمت: 105٬120٬000 ✅
 * ⏱️ ساعت: 15:18:50 1405/06/19
 * 🔖 شماره حواله: 9368
 *
 * Invariants:
 * - INV-04: displayedPrice = compactPrice * 1000 (must be exact multiple of 1000).
 * - Receipt reference numbers are non-unique business metadata.
 */
export function parseTradeReceipt(rawText: string): ParseResult<TradeReceipt> {
  const normalized = normalizeProtocolText(rawText);

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== ".");

  let buyerAlias: string | undefined;
  let sellerAlias: string | undefined;
  let quantity: number | undefined;
  let rawPriceText: string | undefined;
  let rawTimeText: string | undefined;
  let referenceNumber: string | undefined;

  for (const line of lines) {
    const buyerMatch = BUYER_LINE_REGEX.exec(line);
    if (buyerMatch?.[1]) {
      buyerAlias = buyerMatch[1].trim();
      continue;
    }

    const sellerMatch = SELLER_LINE_REGEX.exec(line);
    if (sellerMatch?.[1]) {
      sellerAlias = sellerMatch[1].trim();
      continue;
    }

    const execMatch = EXECUTION_LINE_REGEX.exec(line);
    if (execMatch?.[1] && execMatch[2]) {
      quantity = Number(execMatch[1]);
      rawPriceText = execMatch[2].replace(/[,٬]/g, "");
      continue;
    }

    const timeMatch = TIME_LINE_REGEX.exec(line);
    if (timeMatch?.[1]) {
      rawTimeText = timeMatch[1].trim();
      continue;
    }

    const refMatch = REFERENCE_LINE_REGEX.exec(line);
    if (refMatch?.[1]) {
      referenceNumber = refMatch[1].trim();
      continue;
    }
  }

  const hasAnyReceiptField =
    buyerAlias !== undefined ||
    sellerAlias !== undefined ||
    quantity !== undefined ||
    rawPriceText !== undefined ||
    rawTimeText !== undefined ||
    referenceNumber !== undefined;

  if (
    buyerAlias === undefined ||
    sellerAlias === undefined ||
    quantity === undefined ||
    rawPriceText === undefined ||
    rawTimeText === undefined ||
    referenceNumber === undefined
  ) {
    if (hasAnyReceiptField) {
      return {
        status: "ambiguous",
        reason: "Incomplete trade receipt: missing required receipt fields",
      };
    }

    return {
      status: "unsupported",
      reason: "Message does not match trade receipt format",
    };
  }

  if (buyerAlias.length === 0 || sellerAlias.length === 0) {
    return {
      status: "ambiguous",
      reason: "Buyer or seller alias cannot be empty",
    };
  }

  if (buyerAlias === sellerAlias) {
    return {
      status: "ambiguous",
      reason:
        "Buyer and seller aliases cannot be identical in a confirmed trade receipt",
    };
  }

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      status: "unsupported",
      reason: "Receipt quantity must be a positive safe integer",
    };
  }

  const displayedPrice = Number(rawPriceText);
  if (!Number.isSafeInteger(displayedPrice) || displayedPrice <= 0) {
    return {
      status: "unsupported",
      reason: "Receipt displayed price must be a positive safe integer",
    };
  }

  if (displayedPrice % 1_000 !== 0) {
    return {
      status: "ambiguous",
      reason: "Receipt displayed price must be a multiple of 1000",
    };
  }

  const compactPrice = displayedPrice / 1_000;
  if (!Number.isSafeInteger(compactPrice) || compactPrice <= 0) {
    return {
      status: "unsupported",
      reason: "Receipt compact price must be a positive safe integer",
    };
  }

  if (referenceNumber.length === 0) {
    return {
      status: "ambiguous",
      reason: "Receipt reference number cannot be empty",
    };
  }

  return {
    status: "parsed",
    data: {
      buyerAlias,
      sellerAlias,
      quantity,
      compactPrice,
      displayedPrice,
      rawTimeText,
      referenceNumber,
    },
  };
}
