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
