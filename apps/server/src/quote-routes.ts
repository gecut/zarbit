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
}
