import type { MarketLiveEvent } from "@zarbit/contracts";
import type { createMarketMock } from "./create-market-mock";
import type { MarketScenario } from "./market-scenarios";

/** Fixed event scripts; no randomness or shared mutation state. */
export function runMarketScenario(
  mock: ReturnType<typeof createMarketMock>,
  scenario: MarketScenario,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (delay: number, fn: () => void) =>
    timers.push(setTimeout(fn, delay));
  const event = (type: "QUOTE" | "TRADE", offset: number): MarketLiveEvent => {
    const common = {
      revision: mock.revision() + offset,
      sourceMessageId: mock.revision() + offset,
      compactPrice: 102_350 + offset,
      announcedAt: new Date(mock.now()).toISOString(),
    };
    return type === "QUOTE"
      ? { ...common, type }
      : { ...common, type, id: `live-${common.sourceMessageId}`, quantity: 2 };
  };
  later(2_000, () => {
    mock.advance(2_000);
    if (["disconnect", "restart", "reconnect"].includes(scenario)) {
      mock.disconnect();
      return;
    }
    if (scenario === "reconcile") {
      mock.emit({ type: "RECONCILE_REQUIRED", revision: mock.revision() });
      return;
    }
    if (["empty", "stale", "fallback", "recovery"].includes(scenario)) return;
    if (scenario === "out-of-order") {
      const quote = event("QUOTE", 10);
      const trade = event("TRADE", 20);
      mock.emit(trade);
      mock.emit(quote);
      return;
    }
    const point = event(
      ["trade-only", "quote-unavailable"].includes(scenario)
        ? "TRADE"
        : "QUOTE",
      scenario === "older" ? -20 : 10,
    );
    mock.emit(point);
    if (scenario === "duplicate") mock.emit(point);
  });
  if (["restart", "reconnect", "recovery"].includes(scenario))
    later(8_000, () => {
      mock.recover();
    });
  return () => {
    for (const timer of timers) clearTimeout(timer);
    mock.disconnect();
  };
}
