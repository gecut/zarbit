import { compactQuoteToDisplayPrice } from "@zarbit/domain";
import type { Hono } from "hono";

import type { AppEnv, AppDependencies } from "./app-types";

export function registerQuoteRoutes(app: Hono<AppEnv>, deps: AppDependencies) {
  app.get("/api/quote/latest", async (c) => {
    const quote = await deps.store.latestQuote();
    return c.json({
      data: quote
        ? {
            quote: compactQuoteToDisplayPrice(quote.compactQuote),
            announcedAt: quote.announcedAt.toISOString(),
          }
        : null,
    });
  });

  app.get("/api/quote/dashboard", async (c) => {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000);
    const [latest, points] = await Promise.all([
      deps.store.latestQuote(),
      deps.store.quotesSince(since),
    ]);
    return c.json({
      data: {
        latest: latest
          ? {
              quote: compactQuoteToDisplayPrice(latest.compactQuote),
              announcedAt: latest.announcedAt.toISOString(),
            }
          : null,
        points: points.map((point) => ({
          quote: compactQuoteToDisplayPrice(point.compactQuote),
          announcedAt: point.announcedAt.toISOString(),
        })),
      },
    });
  });
}
