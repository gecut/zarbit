import { marketSnapshotSchema } from "@zarbit/contracts";
import { compareTradeToQuote } from "@zarbit/domain";

export const marketScenarios = [
  "normal",
  "quote-only",
  "trade-only",
  "no-trade",
  "quote-unavailable",
  "stale",
  "duplicate",
  "older",
  "out-of-order",
  "delayed",
  "disconnect",
  "reconnect",
  "reconcile",
  "restart",
  "fallback",
  "recovery",
  "requests-one",
  "requests-multiple",
  "telegram-transitional",
  "telegram-unavailable",
  "empty",
] as const;
export type MarketScenario = (typeof marketScenarios)[number];
export function parseMarketScenario(value: string | null): MarketScenario {
  return marketScenarios.find((scenario) => scenario === value) ?? "normal";
}
export const mockEpoch = Date.parse("2026-09-13T12:00:00.000Z");

export function createMarketFixtures(scenario: MarketScenario, now: number) {
  const hasQuote = !["empty", "trade-only", "quote-unavailable"].includes(
    scenario,
  );
  const hasTrade = !["empty", "quote-only", "no-trade"].includes(scenario);

  const quoteAnnouncedAt =
    scenario === "stale"
      ? new Date(now - 3_600_000).toISOString()
      : new Date(now - 60_000).toISOString();

  const quote = hasQuote
    ? {
        compactPrice: 102_500,
        announcedAt: quoteAnnouncedAt,
        sourceMessageId: 101,
      }
    : null;

  const trade = hasTrade
    ? {
        id: "trade-1",
        compactPrice: 102_450,
        quantity: 2,
        announcedAt: new Date(
          now - (scenario === "stale" ? 120_000 : 1000),
        ).toISOString(),
        sourceMessageId: 102,
      }
    : null;

  const snapshot = marketSnapshotSchema.parse({
    quote,
    trade,
    revision: Math.max(
      quote?.sourceMessageId ?? 0,
      trade?.sourceMessageId ?? 0,
    ),
    tradeQuoteDifference: compareTradeToQuote(
      trade?.compactPrice ?? null,
      quote?.compactPrice ?? null,
    ),
    asOf: new Date(now).toISOString(),
  });

  return { snapshot };
}
