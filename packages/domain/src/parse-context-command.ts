import { normalizeCompactText, normalizeProtocolText } from "./normalize";
import type {
  CommandContext,
  ContextCommandIntent,
  ParseResult,
} from "./types";

/**
 * Parses context-dependent trading commands:
 * - "ب" (take all remaining from active replied order)
 * - "ن" (cancellation intent)
 * - Numeric standalone reply (take partial quantity or quote update)
 *
 * Rejects unresolved variants like "ب 1" or guessing without required context.
 */
export function parseContextCommand(
  rawText: string,
  context?: CommandContext,
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

  // Canonical "ب" command — TAKE_ALL_REMAINING
  if (compact === "ب") {
    if (context?.hasActiveRepliedOrder === true) {
      return {
        status: "parsed",
        data: {
          command: "TAKE_ALL_REMAINING",
          executionQuantity: context.repliedOrderRemaining ?? null,
        },
      };
    }

    if (context?.hasActiveRepliedOrder === false) {
      return {
        status: "unsupported",
        reason: "Target replied order is not active",
      };
    }

    return {
      status: "ambiguous",
      reason: "Command 'ب' requires active replied order context",
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
    if (context?.hasRepliedToOwnOrder === true) {
      return {
        status: "parsed",
        data: {
          command: "CANCEL",
          target: "REPLIED_ORDER",
        },
      };
    }

    // Per MARKET-DATA.md: Absent reply metadata on contextual commands marks target as UNRESOLVED_TARGET, never guessed.
    return {
      status: "parsed",
      data: {
        command: "CANCEL",
        target: "UNRESOLVED_TARGET",
      },
    };
  }

  // Standalone numeric replies
  if (/^\d+$/u.test(compact)) {
    const value = Number(compact);
    if (!Number.isSafeInteger(value) || value <= 0) {
      return {
        status: "unsupported",
        reason: "Standalone numeric value must be a positive safe integer",
      };
    }

    if (context?.hasActiveRepliedOrder === true) {
      if (
        context.repliedOrderRemaining !== undefined &&
        value > context.repliedOrderRemaining
      ) {
        return {
          status: "ambiguous",
          reason: `Requested take quantity (${value}) exceeds remaining order quantity (${context.repliedOrderRemaining})`,
        };
      }

      return {
        status: "parsed",
        data: {
          command: "TAKE_PARTIAL",
          quantity: value,
        },
      };
    }

    if (context?.isQuotePublisher === true && !context?.hasActiveRepliedOrder) {
      return {
        status: "parsed",
        data: {
          command: "QUOTE_INPUT",
          rawQuoteText: compact,
        },
      };
    }

    return {
      status: "ambiguous",
      reason:
        "Standalone numeric command requires active order reply context or quote publisher permission",
    };
  }

  return {
    status: "unsupported",
    reason: "Message does not match any confirmed context command",
  };
}
