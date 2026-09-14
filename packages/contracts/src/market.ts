import { z } from "zod";

export const marketQuoteSchema = z
  .object({
    compactPrice: z.number().int().positive().safe(),
    announcedAt: z.string().datetime(),
    sourceMessageId: z.number().int().positive().safe(),
  })
  .strict();
export const marketTradeSchema = marketQuoteSchema
  .extend({
    id: z.string().min(1),
    quantity: z.number().int().positive().safe(),
  })
  .strict();
export const marketSnapshotSchema = z
  .object({
    revision: z.number().int().nonnegative().safe(),
    quote: marketQuoteSchema.nullable(),
    trade: marketTradeSchema.nullable(),
    recentTrades: z.array(marketTradeSchema).max(10).default([]),
    tradeQuoteDifference: z.number().int().safe().nullable(),
    asOf: z.string().datetime(),
  })
  .strict();
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;
const revision = z.number().int().nonnegative().safe();
export const marketLiveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SYNC"), revision }).strict(),
  marketQuoteSchema.extend({ type: z.literal("QUOTE"), revision }).strict(),
  marketTradeSchema.extend({ type: z.literal("TRADE"), revision }).strict(),
  z.object({ type: z.literal("RECONCILE_REQUIRED"), revision }).strict(),
]);
export type MarketLiveEvent = z.infer<typeof marketLiveEventSchema>;
export const marketNotificationSchema = z
  .object({
    type: z.enum(["QUOTE", "TRADE"]),
    sourceMessageId: z.number().int().positive().safe(),
  })
  .strict();
export type MarketNotification = z.infer<typeof marketNotificationSchema>;
