import { z } from "zod";

export const dataCoverageConfidenceSchema = z.enum([
  "HIGH",
  "ESTIMATED",
  "UNVERIFIED_INVENTORY",
]);
export type DataCoverageConfidence = z.infer<
  typeof dataCoverageConfidenceSchema
>;

export const traderSortFieldSchema = z.enum([
  "REALIZED_PNL",
  "VOLUME",
  "TRADE_COUNT",
  "AVG_TRADE_SIZE",
]);
export type TraderSortField = z.infer<typeof traderSortFieldSchema>;

export const sortOrderSchema = z.enum(["ASC", "DESC"]);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const participantAnalyticsSummarySchema = z
  .object({
    alias: z.string().min(1),
    realizedPnlPoints: z.number(),
    realizedPnlTomans: z.number(),
    totalVolume: z.number().int().nonnegative(),
    buyVolume: z.number().int().nonnegative(),
    sellVolume: z.number().int().nonnegative(),
    totalTrades: z.number().int().nonnegative(),
    buyTrades: z.number().int().nonnegative(),
    sellTrades: z.number().int().nonnegative(),
    averageTradeSize: z.number().nonnegative(),
    observedPosition: z.number().int(),
    currentCostBasis: z.number().nonnegative(),
    confidence: dataCoverageConfidenceSchema,
    hasZeroCrossing: z.boolean(),
    unmatchedUnits: z.number().int().nonnegative(),
    firstTradeAt: z.string().nullable(),
  })
  .strict();
export type ParticipantAnalyticsSummary = z.infer<
  typeof participantAnalyticsSummarySchema
>;

export const traderRecentTradeSchema = z
  .object({
    id: z.string(),
    sourceMessageId: z.number().int(),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().int().positive(),
    compactPrice: z.number().int().positive(),
    counterpartyAlias: z.string().min(1),
    announcedAt: z.string(),
  })
  .strict();
export type TraderRecentTrade = z.infer<typeof traderRecentTradeSchema>;

export const participantAnalyticsDetailSchema = z
  .object({
    summary: participantAnalyticsSummarySchema,
    windowStart: z.string(),
    windowEnd: z.string(),
    recentTrades: z.array(traderRecentTradeSchema),
  })
  .strict();
export type ParticipantAnalyticsDetail = z.infer<
  typeof participantAnalyticsDetailSchema
>;

export const traderListQuerySchema = z
  .object({
    sortBy: traderSortFieldSchema.default("REALIZED_PNL"),
    sortOrder: sortOrderSchema.default("DESC"),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export type TraderListQuery = z.infer<typeof traderListQuerySchema>;

export const traderDetailQuerySchema = z
  .object({
    alias: z.string().min(1).max(100),
  })
  .strict();
export type TraderDetailQuery = z.infer<typeof traderDetailQuerySchema>;

export const analyticsContributionV2Schema = z
  .object({
    realizedPnlPoints: z.number().nullable(),
    realizedPnlTomans: z.number().nullable(),
    buyVolume: z.number().int().nonnegative(),
    sellVolume: z.number().int().nonnegative(),
    totalVolume: z.number().int().nonnegative(),
    buyTrades: z.number().int().nonnegative(),
    sellTrades: z.number().int().nonnegative(),
    totalTrades: z.number().int().nonnegative(),
  })
  .strict();

export const participantAnalyticsSummaryV2Schema =
  participantAnalyticsSummarySchema
    .omit({ realizedPnlPoints: true, realizedPnlTomans: true })
    .extend({
      realizedPnlPoints: z.number().nullable(),
      realizedPnlTomans: z.number().nullable(),
      contributions: z
        .object({
          normal: analyticsContributionV2Schema,
          settlement: analyticsContributionV2Schema,
          total: analyticsContributionV2Schema,
        })
        .strict(),
      coverage: z
        .object({
          positionBaselineValid: z.boolean(),
          status: z.enum(["VERIFIED", "REVIEW_REQUIRED", "UNKNOWN"]),
          pnlReliable: z.boolean(),
          reason: z.string().nullable(),
        })
        .strict(),
    })
    .strict();
export type ParticipantAnalyticsSummaryV2 = z.infer<
  typeof participantAnalyticsSummaryV2Schema
>;

const recentTradeV2Base = traderRecentTradeSchema.omit({
  sourceMessageId: true,
  counterpartyAlias: true,
});
export const traderRecentTradeV2Schema = z.discriminatedUnion("type", [
  recentTradeV2Base
    .extend({
      type: z.literal("NORMAL"),
      sourceMessageId: z.number().int().positive(),
      settlementMessageId: z.null(),
      counterpartyAlias: z.string().min(1),
    })
    .strict(),
  recentTradeV2Base
    .extend({
      type: z.literal("SETTLEMENT"),
      sourceMessageId: z.null(),
      settlementMessageId: z.number().int().positive(),
      counterpartyAlias: z.null(),
    })
    .strict(),
]);
export type TraderRecentTradeV2 = z.infer<typeof traderRecentTradeV2Schema>;

export const participantAnalyticsDetailV2Schema = z
  .object({
    summary: participantAnalyticsSummaryV2Schema,
    windowStart: z.string(),
    windowEnd: z.string(),
    recentTrades: z.array(traderRecentTradeV2Schema),
  })
  .strict();
export type ParticipantAnalyticsDetailV2 = z.infer<
  typeof participantAnalyticsDetailV2Schema
>;
