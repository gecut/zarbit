import type { Hono } from "hono";
import type { AppDependencies } from "../../app-dependencies";
import type { AppEnv } from "../../transport/http/app-env";

export function registerQuoteRoutes(app: Hono<AppEnv>, deps: AppDependencies) {
  app.get("/api/quote/latest", async (c) => {
    const latest = await deps.store.latestQuote();
    return c.json({
      data: latest
        ? {
            quote: latest.compactQuote,
            announcedAt: latest.announcedAt.toISOString(),
          }
        : null,
    });
  });

  app.get("/api/quote/dashboard", async (c) => {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000);
    const [latestQuote, latestTrade, points] = await Promise.all([
      deps.store.latestQuote(),
      deps.store.latestTrade ? deps.store.latestTrade() : Promise.resolve(null),
      deps.store.quotesSince(since),
    ]);
    return c.json({
      data: {
        latest: latestQuote
          ? {
              quote: latestQuote.compactQuote,
              announcedAt: latestQuote.announcedAt.toISOString(),
            }
          : null,
        latestTrade: latestTrade
          ? {
              price: latestTrade.compactPrice,
              announcedAt: latestTrade.announcedAt.toISOString(),
            }
          : null,
        points: points.map((point) => ({
          quote: point.compactQuote,
          announcedAt: point.announcedAt.toISOString(),
        })),
      },
    });
  });

  app.get("/api/quote/history", async (c) => {
    const now = new Date();
    const since = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const quotes = await deps.store.quotesSince(since);
    const { downsampleQuoteHistory } = await import("@zarbit/domain");
    return c.json({
      data: downsampleQuoteHistory(quotes, { now }),
    });
  });
}
