import { normalizeProtocolText } from "./normalize";
import { parseCanonicalBotOrder } from "./parse-canonical-bot-order";
import { parseCanonicalBotQuote } from "./parse-canonical-bot-quote";
import { parseContextCommand } from "./parse-context-command";
import { parseHumanOrder } from "./parse-human-order";
import { parseTradeReceipt } from "./parse-trade-receipt";
import type { ClassifiedProtocolMessage, CommandContext } from "./types";

/**
 * Top-level deterministic classifier that evaluates group messages against
 * confirmed Phase 1 protocol concepts in strict precedence:
 *
 * 1. Authoritative bot quote (🟡 مظنه: ...)
 * 2. Authoritative bot trade receipt (حواله)
 * 3. Authoritative canonical bot order (🔵 / 🔴 ... مانده: ...)
 * 4. Human BUY/SELL order (لفظ)
 * 5. Context-dependent command (ب, ن, numeric reply)
 *
 * Prefers parsed, ambiguous, or unsupported states over guessing.
 */
export function classifyProtocolMessage(
  rawText: string,
  context?: CommandContext,
): ClassifiedProtocolMessage {
  const normalized = normalizeProtocolText(rawText);
  if (normalized.length === 0) {
    return {
      kind: "UNSUPPORTED",
      reason: "Message text is empty after normalization",
    };
  }

  // 1. Authoritative bot quote announcement
  const quoteResult = parseCanonicalBotQuote(rawText);
  if (quoteResult.status === "parsed") {
    return {
      kind: "CANONICAL_BOT_QUOTE",
      quote: quoteResult.data,
    };
  }

  // 2. Authoritative bot trade receipt
  const receiptResult = parseTradeReceipt(rawText);
  if (receiptResult.status === "parsed") {
    return {
      kind: "TRADE_RECEIPT",
      receipt: receiptResult.data,
    };
  }
  if (receiptResult.status === "ambiguous") {
    return {
      kind: "AMBIGUOUS",
      reason: receiptResult.reason,
    };
  }

  // 3. Authoritative canonical bot order
  const canonicalOrderResult = parseCanonicalBotOrder(rawText);
  if (canonicalOrderResult.status === "parsed") {
    return {
      kind: "CANONICAL_BOT_ORDER",
      order: canonicalOrderResult.data,
    };
  }
  if (canonicalOrderResult.status === "ambiguous") {
    return {
      kind: "AMBIGUOUS",
      reason: canonicalOrderResult.reason,
    };
  }

  // 4. Human BUY/SELL order intent
  const humanOrderResult = parseHumanOrder(rawText, {
    referenceQuote: context?.currentQuote,
  });
  if (humanOrderResult.status === "parsed") {
    return {
      kind: "HUMAN_ORDER",
      order: humanOrderResult.data,
    };
  }
  if (humanOrderResult.status === "ambiguous") {
    return {
      kind: "AMBIGUOUS",
      reason: humanOrderResult.reason,
    };
  }

  // 5. Context-dependent commands
  const contextResult = parseContextCommand(rawText, context);
  if (contextResult.status === "parsed") {
    return {
      kind: "CONTEXT_COMMAND",
      command: contextResult.data,
    };
  }
  if (contextResult.status === "ambiguous") {
    return {
      kind: "AMBIGUOUS",
      reason: contextResult.reason,
    };
  }
  if (
    contextResult.status === "unsupported" &&
    contextResult.reason.includes("unresolved")
  ) {
    return {
      kind: "UNSUPPORTED",
      reason: contextResult.reason,
    };
  }

  return {
    kind: "UNSUPPORTED",
    reason: "Message does not match any confirmed protocol syntax",
  };
}
