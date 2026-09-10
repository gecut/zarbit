import type { QuoteDashboard, QuotePoint } from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";
import type { ResponseCache } from "../../platform/cache/response-cache";

export interface QuoteRouterDependencies {
  store: AppDependencies["store"];
  quotes: ResponseCache<QuoteDashboard>;
  read: <T>(name: string, load: () => Promise<T>) => Promise<T>;
}

export function createQuoteRouter<TDashboardProcedure, TLatestProcedure>(
  builder: {
    dashboard: {
      handler: (fn: () => Promise<QuoteDashboard>) => TDashboardProcedure;
    };
    latest: {
      handler: (fn: () => Promise<QuotePoint | null>) => TLatestProcedure;
    };
  },
  deps: QuoteRouterDependencies,
): { dashboard: TDashboardProcedure; latest: TLatestProcedure } {
  const dashboard = () =>
    deps.quotes.get("global", () =>
      deps.read("quote", async () => {
        const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const [latest, points] = await Promise.all([
          deps.store.latestQuote(),
          deps.store.quotesSince(since),
        ]);
        return {
          latest: latest
            ? {
                quote: latest.compactQuote,
                announcedAt: latest.announcedAt.toISOString(),
              }
            : null,
          points: points.map((p) => ({
            quote: p.compactQuote,
            announcedAt: p.announcedAt.toISOString(),
          })),
        };
      }),
    );

  return {
    dashboard: builder.dashboard.handler(dashboard),
    latest: builder.latest.handler(async () => (await dashboard()).latest),
  };
}
