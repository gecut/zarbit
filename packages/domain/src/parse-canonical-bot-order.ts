import { normalizeProtocolText } from "./normalize";
import type { CanonicalBotOrder, ParseResult, TradingSide } from "./types";

const CANONICAL_ORDER_REGEX =
  /^(?:[.\s]*)(🔵|🔴)\s+(.+?)\s+(\d+)\s+([خف])\s+(\d+)\s+\(مانده:\s*(\d+)\)\s*$/u;

/**
 * Parses authoritative canonical bot order messages from the group.
 * Example formats:
 * - "🔵 رسول اُف 1 خ 104900 (مانده: 1)"
 * - "🔴 سناتور 2 ف 105120 (مانده: 2)"
 *
 * Enforces protocol invariants:
 * - INV-01: خ = BUY, ف = SELL
 * - INV-02: 🔵 = BUY, 🔴 = SELL
 * - INV-03: 0 <= remaining <= quantity
 */
export function parseCanonicalBotOrder(
  rawText: string,
): ParseResult<CanonicalBotOrder> {
  const normalized = normalizeProtocolText(rawText);

  const match = CANONICAL_ORDER_REGEX.exec(normalized);
  if (!match) {
    if (
      (normalized.includes("🔵") || normalized.includes("🔴")) &&
      normalized.includes("مانده:")
    ) {
      return {
        status: "ambiguous",
        reason: "Malformed canonical bot order structure",
      };
    }

    return {
      status: "unsupported",
      reason: "Message does not match canonical bot order pattern",
    };
  }

  const indicator = match[1];
  const aliasRaw = match[2];
  const quantityRaw = match[3];
  const sideMarker = match[4];
  const priceRaw = match[5];
  const remainingRaw = match[6];

  if (
    indicator === undefined ||
    aliasRaw === undefined ||
    quantityRaw === undefined ||
    sideMarker === undefined ||
    priceRaw === undefined ||
    remainingRaw === undefined
  ) {
    return {
      status: "ambiguous",
      reason: "Canonical bot order contains missing match groups",
    };
  }

  const participantAlias = aliasRaw.trim();
  if (participantAlias.length === 0) {
    return {
      status: "ambiguous",
      reason: "Participant alias cannot be empty",
    };
  }

  const isBuyIndicator = indicator === "🔵";
  const isSellIndicator = indicator === "🔴";
  const isBuyMarker = sideMarker === "خ";
  const isSellMarker = sideMarker === "ف";

  if ((isBuyIndicator && !isBuyMarker) || (isSellIndicator && !isSellMarker)) {
    return {
      status: "ambiguous",
      reason: "Mismatch between indicator color and trading side marker",
    };
  }

  const side: TradingSide = isBuyMarker ? "BUY" : "SELL";

  const quantity = Number(quantityRaw);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      status: "unsupported",
      reason: "Order quantity must be a positive safe integer",
    };
  }

  const compactPrice = Number(priceRaw);
  if (!Number.isSafeInteger(compactPrice) || compactPrice <= 0) {
    return {
      status: "unsupported",
      reason: "Order price must be a positive safe integer",
    };
  }

  const remaining = Number(remainingRaw);
  if (!Number.isSafeInteger(remaining) || remaining < 0) {
    return {
      status: "unsupported",
      reason: "Remaining quantity must be a non-negative safe integer",
    };
  }

  if (remaining > quantity) {
    return {
      status: "ambiguous",
      reason: `Remaining quantity (${remaining}) exceeds original order quantity (${quantity})`,
    };
  }

  return {
    status: "parsed",
    data: {
      side,
      participantAlias,
      quantity,
      remaining,
      compactPrice,
    },
  };
}
