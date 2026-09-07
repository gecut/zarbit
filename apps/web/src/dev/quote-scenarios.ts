import type { LatestQuote, QuoteDashboard } from "@zarbit/contracts";

export type QuoteScenario = "normal" | "empty" | "loading" | "stale" | "error";

export function getQuoteScenario(search: string): QuoteScenario {
  const value = new URLSearchParams(search).get("quoteScenario");
  return ["empty", "loading", "stale", "error"].includes(value ?? "")
    ? (value as QuoteScenario)
    : "normal";
}

export function createQuoteDashboard(
  scenario: QuoteScenario,
  now = Date.now(),
): QuoteDashboard {
  if (scenario === "empty") return { latest: null, points: [] };

  const latestOffset = scenario === "stale" ? 6 * 60_000 : 2 * 60_000;
  const compactQuotes = [95_820, 95_940, 95_760, 96_080, 95_900, 96_120];
  const points = compactQuotes.map((compactQuote, index) => ({
    quote: compactQuote * 1_000,
    announcedAt: new Date(
      now - (compactQuotes.length - index) * 12 * 60 * 60 * 1_000,
    ).toISOString(),
  }));
  const latest: LatestQuote = {
    quote: 96_120_000,
    announcedAt: new Date(now - latestOffset).toISOString(),
  };

  return { latest, points };
}
