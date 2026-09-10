import { normalizeCompactText, normalizeProtocolText } from "./normalize";
import { resolvePriceAgainstQuote } from "./price-resolver";
import type { HumanOrderIntent, ParseResult, TradingSide } from "./types";

const HUMAN_ORDER_REGEX = /^(\d*)([خف])(\d+)$/u;

export interface ParseHumanOrderOptions {
  readonly referenceQuote?: number;
}

/**
 * Parses raw human trading commands ("لفظ").
 *
 * Syntax: [quantity?][خ|ف][price]
 * - خ = BUY
 * - ف = SELL
 * - Omitted quantity defaults to 1 (INV-08)
 * - 6-digit price is full compact price
 * - 1-3 digit price is shorthand suffix (resolved against referenceQuote if provided)
 */
export function parseHumanOrder(
  rawText: string,
  options?: ParseHumanOrderOptions,
): ParseResult<HumanOrderIntent> {
  const normalized = normalizeProtocolText(rawText);

  // Human orders are single-line commands
  if (normalized.includes("\n")) {
    return {
      status: "unsupported",
      reason: "Human order command must be a single-line expression",
    };
  }

  const compact = normalizeCompactText(normalized);

  const match = HUMAN_ORDER_REGEX.exec(compact);
  if (!match) {
    if (/[خف]/.test(compact)) {
      return {
        status: "unsupported",
        reason:
          "Malformed order syntax containing invalid characters or keywords",
      };
    }

    return {
      status: "unsupported",
      reason: "Message does not match human order grammar",
    };
  }

  const quantityPart = match[1];
  const sidePart = match[2];
  const pricePart = match[3];

  if (sidePart === undefined || pricePart === undefined) {
    return {
      status: "ambiguous",
      reason: "Missing side or price in parsed order",
    };
  }

  const side: TradingSide = sidePart === "خ" ? "BUY" : "SELL";

  let quantity = 1;
  if (quantityPart && quantityPart.length > 0) {
    quantity = Number(quantityPart);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return {
        status: "unsupported",
        reason: "Order quantity must be a positive safe integer",
      };
    }
  }

  const priceLength = pricePart.length;

  if (priceLength === 6) {
    const compactPrice = Number(pricePart);
    if (!Number.isSafeInteger(compactPrice) || compactPrice <= 0) {
      return {
        status: "unsupported",
        reason: "Full compact price must be a positive safe integer",
      };
    }

    return {
      status: "parsed",
      data: {
        side,
        quantity,
        rawPriceText: pricePart,
        priceKind: "FULL_COMPACT",
        resolvedCompactPrice: compactPrice,
      },
    };
  }

  if (priceLength >= 1 && priceLength <= 3) {
    if (options?.referenceQuote !== undefined) {
      const resolution = resolvePriceAgainstQuote(
        pricePart,
        options.referenceQuote,
      );

      if (resolution.status === "parsed") {
        return {
          status: "parsed",
          data: {
            side,
            quantity,
            rawPriceText: pricePart,
            priceKind: "SHORTHAND_SUFFIX",
            resolvedCompactPrice: resolution.data.resolvedCompactPrice,
          },
        };
      }

      if (resolution.status === "ambiguous") {
        return {
          status: "ambiguous",
          reason: resolution.reason,
        };
      }

      return {
        status: "unsupported",
        reason: resolution.reason,
      };
    }

    return {
      status: "parsed",
      data: {
        side,
        quantity,
        rawPriceText: pricePart,
        priceKind: "SHORTHAND_SUFFIX",
        resolvedCompactPrice: null,
      },
    };
  }

  if (priceLength === 4 || priceLength === 5) {
    return {
      status: "unsupported",
      reason:
        "4- or 5-digit price is neither a standard 6-digit compact price nor a 1-3 digit suffix",
    };
  }

  if (priceLength === 9) {
    return {
      status: "unsupported",
      reason:
        "9-digit monetary input is non-normative in protocol specification",
    };
  }

  return {
    status: "unsupported",
    reason: `Price string of length ${priceLength} is not supported by protocol grammar`,
  };
}
