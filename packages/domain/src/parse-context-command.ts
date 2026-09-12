import { normalizeCompactText, normalizeProtocolText } from "./normalize";
import type { ContextCommandIntent, ParseResult } from "./types";

/**
 * Parses context-dependent trading commands:
 * - "ب" (take all remaining from active replied order)
 * - "ن" (cancellation intent)
 * - Numeric standalone reply (take partial quantity)
 *
 * Rejects unresolved variants like "ب 1" or repeated "نن".
 */
export function parseContextCommand(
  rawText: string,
): ParseResult<ContextCommandIntent> {
  const normalized = normalizeProtocolText(rawText);

  if (normalized.includes("\n")) {
    return {
      status: "unsupported",
      reason: "Context command must be a single-line expression",
    };
  }

  const compact = normalizeCompactText(normalized);

  // Variant "ب <number>" — explicitly marked UNRESOLVED in protocol spec (Section 33)
  if (/^ب\d+$/u.test(compact)) {
    return {
      status: "unsupported",
      reason: "Variant 'ب <number>' is unresolved in protocol specification",
    };
  }

  // Canonical "ب" command — TAKE_ALL
  if (compact === "ب") {
    return {
      status: "parsed",
      data: {
        command: "TAKE_ALL",
      },
    };
  }

  // Repeated "ن" (e.g. "نن") — malformed
  if (/^ن{2,}$/u.test(compact)) {
    return {
      status: "unsupported",
      reason: "Repeated 'ن' is invalid syntax",
    };
  }

  // Canonical "ن" command — CANCEL
  if (compact === "ن") {
    return {
      status: "parsed",
      data: {
        command: "CANCEL",
      },
    };
  }

  // Standalone numeric replies (TAKE_QUANTITY)
  if (/^\d+$/u.test(compact)) {
    const value = Number(compact);
    if (!Number.isSafeInteger(value) || value <= 0) {
      return {
        status: "unsupported",
        reason: "Standalone numeric value must be a positive safe integer",
      };
    }

    return {
      status: "parsed",
      data: {
        command: "TAKE_QUANTITY",
        quantity: value,
      },
    };
  }

  return {
    status: "unsupported",
    reason: "Message does not match any confirmed context command",
  };
}
