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
    const [latest, points] = await Promise.all([
      deps.store.latestQuote(),
      deps.store.quotesSince(since),
    ]);
    return c.json({
      data: {
        latest: latest
          ? {
              quote: latest.compactQuote,
              announcedAt: latest.announcedAt.toISOString(),
            }
          : null,
        points: points.map((point) => ({
          quote: point.compactQuote,
          announcedAt: point.announcedAt.toISOString(),
        })),
      },
    });
  });
}
