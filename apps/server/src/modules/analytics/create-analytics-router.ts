import type {
  ParticipantAnalyticsDetail,
  ParticipantAnalyticsSummary,
  TraderDetailQuery,
  TraderListQuery,
} from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";
import { ResponseCache } from "../../platform/cache/response-cache";
import { AnalyticsService } from "./analytics-service";

export interface AnalyticsRouterDependencies {
  store: AppDependencies["store"];
  service: AnalyticsService;
  tradersCache: ResponseCache<ParticipantAnalyticsSummary[]>;
  traderDetailCache?: ResponseCache<ParticipantAnalyticsDetail | null>;
  read: <T>(name: string, load: () => Promise<T>) => Promise<T>;
}

export function createAnalyticsRouter<TTradersProcedure, TDetailProcedure>(
  builder: {
    traders: {
      handler: (
        fn: (opts: {
          input?: TraderListQuery;
        }) => Promise<ParticipantAnalyticsSummary[]>,
      ) => TTradersProcedure;
    };
    traderDetail: {
      handler: (
        fn: (opts: {
          input: TraderDetailQuery;
        }) => Promise<ParticipantAnalyticsDetail | null>,
      ) => TDetailProcedure;
    };
  },
  deps: AnalyticsRouterDependencies,
): { traders: TTradersProcedure; traderDetail: TDetailProcedure } {
  const traderDetailCache =
    deps.traderDetailCache ??
    new ResponseCache<ParticipantAnalyticsDetail | null>({
      ttlMs: 5000,
      staleMs: 5000,
      maxEntries: 50,
    });

  return {
    traders: builder.traders.handler(async ({ input }) => {
      const query: TraderListQuery = {
        sortBy: input?.sortBy ?? "REALIZED_PNL",
        sortOrder: input?.sortOrder ?? "DESC",
        limit: input?.limit ?? 50,
      };
      const cacheKey = `${query.sortBy}:${query.sortOrder}:${query.limit}`;
      return deps.tradersCache.get(cacheKey, () =>
        deps.read("analytics.traders", () =>
          deps.service.getTradersList(query),
        ),
      );
    }),
    traderDetail: builder.traderDetail.handler(async ({ input }) => {
      return traderDetailCache.get(input.alias, () =>
        deps.read("analytics.traderDetail", () =>
          deps.service.getTraderDetail(input.alias),
        ),
      );
    }),
  };
}
