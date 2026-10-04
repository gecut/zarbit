import type {
  ParticipantAnalyticsDetail,
  ParticipantAnalyticsSummary,
  ParticipantAnalyticsDetailV2,
  ParticipantAnalyticsSummaryV2,
  TraderDetailQuery,
  TraderListQuery,
} from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";
import { ResponseCache } from "../../platform/cache/response-cache";
import { AnalyticsService } from "./analytics-service";
import { SettlementAnalyticsService } from "./settlement-analytics-service";

export interface AnalyticsRouterDependencies {
  store: AppDependencies["store"];
  service: AnalyticsService;
  settlementService: SettlementAnalyticsService;
  tradersCache: ResponseCache<ParticipantAnalyticsSummary[]>;
  traderDetailCache?: ResponseCache<ParticipantAnalyticsDetail | null>;
  read: <T>(name: string, load: () => Promise<T>) => Promise<T>;
}

export function createAnalyticsRouter<
  TTradersProcedure,
  TDetailProcedure,
  TTradersV2Procedure,
  TDetailV2Procedure,
>(
  builder: {
    tradersV2: {
      handler: (
        fn: (opts: {
          input?: TraderListQuery;
        }) => Promise<ParticipantAnalyticsSummaryV2[]>,
      ) => TTradersV2Procedure;
    };
    traderDetailV2: {
      handler: (
        fn: (opts: {
          input: TraderDetailQuery;
        }) => Promise<ParticipantAnalyticsDetailV2 | null>,
      ) => TDetailV2Procedure;
    };
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
): {
  traders: TTradersProcedure;
  traderDetail: TDetailProcedure;
  tradersV2: TTradersV2Procedure;
  traderDetailV2: TDetailV2Procedure;
} {
  const traderDetailCache =
    deps.traderDetailCache ??
    new ResponseCache<ParticipantAnalyticsDetail | null>({
      ttlMs: 5000,
      staleMs: 5000,
      maxEntries: 50,
    });
  const tradersV2Cache = new ResponseCache<ParticipantAnalyticsSummaryV2[]>({
    ttlMs: 5000,
    staleMs: 5000,
    maxEntries: 10,
  });
  const traderDetailV2Cache =
    new ResponseCache<ParticipantAnalyticsDetailV2 | null>({
      ttlMs: 5000,
      staleMs: 5000,
      maxEntries: 50,
    });

  return {
    tradersV2: builder.tradersV2.handler(async ({ input }) => {
      const query: TraderListQuery = {
        sortBy: input?.sortBy ?? "REALIZED_PNL",
        sortOrder: input?.sortOrder ?? "DESC",
        limit: input?.limit ?? 50,
      };
      const revision = await deps.store.analyticsRevision();
      return tradersV2Cache.get(
        `${revision}:${query.sortBy}:${query.sortOrder}:${query.limit}`,
        () =>
          deps.read("analytics.tradersV2", () =>
            deps.settlementService.getTradersList(query),
          ),
      );
    }),
    traderDetailV2: builder.traderDetailV2.handler(async ({ input }) => {
      const revision = await deps.store.analyticsRevision();
      return traderDetailV2Cache.get(`${revision}:${input.alias}`, () =>
        deps.read("analytics.traderDetailV2", () =>
          deps.settlementService.getTraderDetail(input.alias),
        ),
      );
    }),
    traders: builder.traders.handler(async ({ input }) => {
      const query: TraderListQuery = {
        sortBy: input?.sortBy ?? "REALIZED_PNL",
        sortOrder: input?.sortOrder ?? "DESC",
        limit: input?.limit ?? 50,
      };
      const revision = await deps.store.analyticsRevision();
      const cacheKey = `${revision}:${query.sortBy}:${query.sortOrder}:${query.limit}`;
      return deps.tradersCache.get(cacheKey, () =>
        deps.read("analytics.traders", () =>
          deps.service.getTradersList(query),
        ),
      );
    }),
    traderDetail: builder.traderDetail.handler(async ({ input }) => {
      const revision = await deps.store.analyticsRevision();
      return traderDetailCache.get(`${revision}:${input.alias}`, () =>
        deps.read("analytics.traderDetail", () =>
          deps.service.getTraderDetail(input.alias),
        ),
      );
    }),
  };
}
