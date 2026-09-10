import { normalizeProtocolText } from "./normalize";
import type { CanonicalBotQuote, ParseResult } from "./types";

const CANONICAL_QUOTE_KEYWORD_REGEX = /(?:^|[^\p{L}])مظنه:/u;
const CANONICAL_QUOTE_REGEX =
  /^(?:[.\s]*)(?:🟡|\u{1F7E1})?\s*مظنه:\s*(\d{4,9})\s*(?:🟡|\u{1F7E1})?\s*$/u;

/**
 * Parses authoritative canonical bot quote announcements from the group.
 * Example formats:
 * - "🟡 مظنه: 105020 🟡"
 * - ".\n🟡 مظنه: 104950 🟡"
 * - "مظنه: ۹۵۹۰۰"
 */
export function parseCanonicalBotQuote(
  rawText: string,
): ParseResult<CanonicalBotQuote> {
  const normalized = normalizeProtocolText(rawText);

  const match = CANONICAL_QUOTE_REGEX.exec(normalized);
  if (!match) {
    if (CANONICAL_QUOTE_KEYWORD_REGEX.test(normalized)) {
      return {
        status: "ambiguous",
        reason: "Malformed canonical bot quote message",
      };
    }

    return {
      status: "unsupported",
      reason: "Message does not match canonical bot quote pattern",
    };
  }

  const quoteRaw = match[1];
  if (quoteRaw === undefined) {
    return {
      status: "ambiguous",
      reason: "Missing quote match group",
    };
  }

  const compactQuote = Number(quoteRaw);
  if (!Number.isSafeInteger(compactQuote) || compactQuote <= 0) {
    return {
      status: "unsupported",
      reason: "Compact quote must be a positive safe integer",
    };
  }

  return {
    status: "parsed",
    data: {
      compactQuote,
    },
  };
}
