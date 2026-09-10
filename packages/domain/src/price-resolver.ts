import type { ParseResult, PriceResolution } from "./types";

/**
 * Resolves a raw price string against the active reference quote.
 *
 * Suffix resolution algorithm derives from observed group protocol:
 * - 6-digit integers: Full compact price (self-describing).
 * - 3-digit suffixes: Evaluated against candidates [base - 1000, base, base + 1000] + suffix.
 * - 1- to 2-digit suffixes: Evaluated against candidates [base - 100, base, base + 100] + suffix.
 *
 * In accordance with protocol safety invariants:
 * - Equidistant candidate matches are rejected as ambiguous rather than guessed.
 * - Out-of-band distances are rejected as ambiguous.
 * - 4/5-digit and non-normative 9-digit values are rejected as unsupported.
 */
export function resolvePriceAgainstQuote(
  rawPriceText: string,
  referenceQuote: number,
): ParseResult<PriceResolution> {
  if (!Number.isSafeInteger(referenceQuote) || referenceQuote <= 0) {
    return {
      status: "ambiguous",
      reason:
        "Reference quote must be a positive safe integer to resolve shorthand price",
    };
  }

  if (!/^\d+$/.test(rawPriceText)) {
    return {
      status: "unsupported",
      reason: "Price string must contain only digits",
    };
  }

  const length = rawPriceText.length;

  if (length === 6) {
    const compactPrice = Number(rawPriceText);
    if (!Number.isSafeInteger(compactPrice) || compactPrice <= 0) {
      return {
        status: "unsupported",
        reason: "Full compact price must be a positive safe integer",
      };
    }
    return {
      status: "parsed",
      data: {
        resolvedCompactPrice: compactPrice,
        mode: "FULL_COMPACT",
      },
    };
  }

  if (length === 3) {
    const suffix = Number(rawPriceText);
    const base = Math.floor(referenceQuote / 1_000) * 1_000;
    const candidates = [
      base - 1_000 + suffix,
      base + suffix,
      base + 1_000 + suffix,
    ].filter((candidate) => candidate > 0);

    const distances = candidates.map((candidate) =>
      Math.abs(candidate - referenceQuote),
    );
    const minDistance = Math.min(...distances);
    const matchingCandidates = candidates.filter(
      (candidate) => Math.abs(candidate - referenceQuote) === minDistance,
    );

    if (matchingCandidates.length !== 1) {
      return {
        status: "ambiguous",
        reason: "Equidistant price candidates around reference quote",
      };
    }

    if (minDistance > 500) {
      return {
        status: "ambiguous",
        reason:
          "Resolved shorthand price candidate exceeds plausible distance from quote",
      };
    }

    const resolved = matchingCandidates[0];
    if (resolved === undefined) {
      return {
        status: "ambiguous",
        reason: "Failed to locate matching price candidate",
      };
    }

    return {
      status: "parsed",
      data: {
        resolvedCompactPrice: resolved,
        mode: "SHORT_SUFFIX",
      },
    };
  }

  if (length === 1 || length === 2) {
    const suffix = Number(rawPriceText);
    const base = Math.floor(referenceQuote / 100) * 100;
    const candidates = [
      base - 100 + suffix,
      base + suffix,
      base + 100 + suffix,
    ].filter((candidate) => candidate > 0);

    const distances = candidates.map((candidate) =>
      Math.abs(candidate - referenceQuote),
    );
    const minDistance = Math.min(...distances);
    const matchingCandidates = candidates.filter(
      (candidate) => Math.abs(candidate - referenceQuote) === minDistance,
    );

    if (matchingCandidates.length !== 1) {
      return {
        status: "ambiguous",
        reason: "Equidistant price candidates around reference quote",
      };
    }

    if (minDistance > 50) {
      return {
        status: "ambiguous",
        reason:
          "Resolved shorthand price candidate exceeds plausible distance from quote",
      };
    }

    const resolved = matchingCandidates[0];
    if (resolved === undefined) {
      return {
        status: "ambiguous",
        reason: "Failed to locate matching price candidate",
      };
    }

    return {
      status: "parsed",
      data: {
        resolvedCompactPrice: resolved,
        mode: "SHORT_SUFFIX",
      },
    };
  }

  if (length === 4 || length === 5) {
    return {
      status: "unsupported",
      reason:
        "4- or 5-digit price is neither a standard 6-digit compact price nor a 1-3 digit suffix",
    };
  }

  if (length === 9) {
    return {
      status: "unsupported",
      reason:
        "9-digit monetary input is non-normative in protocol specification",
    };
  }

  return {
    status: "unsupported",
    reason: `Price string of length ${length} is not supported by protocol grammar`,
  };
}
