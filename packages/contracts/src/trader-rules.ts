import { z } from "zod";

export const traderRuleTriggerSchema = z.enum([
  "ORDER_PLACED",
  "TRADE_CONFIRMED",
]);
export type TraderRuleTrigger = z.infer<typeof traderRuleTriggerSchema>;

export const traderRuleSideSchema = z.enum(["BUY", "SELL", "BOTH"]);
export type TraderRuleSide = z.infer<typeof traderRuleSideSchema>;

export const traderRuleStatusSchema = z.enum(["ENABLED", "DISABLED"]);
export type TraderRuleStatus = z.infer<typeof traderRuleStatusSchema>;

export const traderFollowDirectionSchema = z.enum(["DIRECT", "INVERSE"]);
export type TraderFollowDirection = z.infer<typeof traderFollowDirectionSchema>;

export const traderFollowSizingSchema = z.enum(["FIXED", "SAME"]);
export type TraderFollowSizing = z.infer<typeof traderFollowSizingSchema>;

export const traderRuleAlertStatusSchema = z.enum([
  "SKIPPED",
  "SENT",
  "FAILED",
]);
export type TraderRuleAlertStatus = z.infer<typeof traderRuleAlertStatusSchema>;

export const traderRuleFollowStatusSchema = z.enum([
  "SKIPPED",
  "SUBMITTED",
  "FAILED",
]);
export type TraderRuleFollowStatus = z.infer<
  typeof traderRuleFollowStatusSchema
>;

export const createTraderRuleInputSchema = z
  .object({
    traderAlias: z.string().trim().min(1, "نام معامله‌گر الزامی است").max(100),
    trigger: traderRuleTriggerSchema,
    side: traderRuleSideSchema,
    minQuantity: z
      .number()
      .int()
      .positive("حداقل حجم باید مثبت باشد")
      .default(1),
    alertEnabled: z.boolean().default(true),
    followEnabled: z.boolean().default(false),
    followDirection: traderFollowDirectionSchema.nullable().optional(),
    followSizing: traderFollowSizingSchema.nullable().optional(),
    fixedQuantity: z.number().int().positive().nullable().optional(),
    maxQuantity: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((data) => data.alertEnabled || data.followEnabled, {
    message: "حداقل یکی از اقدامات هشدار یا دنبال‌کردن باید انتخاب شود.",
    path: ["alertEnabled"],
  })
  .refine(
    (data) => {
      if (data.followEnabled) {
        return !!data.followDirection && !!data.followSizing;
      }
      return true;
    },
    {
      message: "در صورت فعال بودن دنبال‌کردن، جهت و نحوه تعیین حجم الزامی است.",
      path: ["followDirection"],
    },
  )
  .refine(
    (data) => {
      if (data.followEnabled && data.followSizing === "FIXED") {
        return !!data.fixedQuantity && data.fixedQuantity > 0;
      }
      return true;
    },
    {
      message: "در حالت حجم ثابت، مقدار حجم الزامی است.",
      path: ["fixedQuantity"],
    },
  );

export type CreateTraderRuleInput = z.infer<typeof createTraderRuleInputSchema>;

export const updateTraderRuleInputSchema = z
  .object({
    side: traderRuleSideSchema.optional(),
    minQuantity: z.number().int().positive().optional(),
    alertEnabled: z.boolean().optional(),
    followEnabled: z.boolean().optional(),
    followDirection: traderFollowDirectionSchema.nullable().optional(),
    followSizing: traderFollowSizingSchema.nullable().optional(),
    fixedQuantity: z.number().int().positive().nullable().optional(),
    maxQuantity: z.number().int().positive().nullable().optional(),
    status: traderRuleStatusSchema.optional(),
  })
  .strict();

export type UpdateTraderRuleInput = z.infer<typeof updateTraderRuleInputSchema>;

export const traderRuleSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    traderAlias: z.string(),
    trigger: traderRuleTriggerSchema,
    side: traderRuleSideSchema,
    minQuantity: z.number().int(),
    alertEnabled: z.boolean(),
    followEnabled: z.boolean(),
    followDirection: traderFollowDirectionSchema.nullable(),
    followSizing: traderFollowSizingSchema.nullable(),
    fixedQuantity: z.number().int().nullable(),
    maxQuantity: z.number().int().nullable(),
    status: traderRuleStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type TraderRuleDto = z.infer<typeof traderRuleSchema>;

export const traderRuleExecutionSchema = z
  .object({
    id: z.string(),
    ruleId: z.string(),
    userId: z.string(),
    traderAlias: z.string(),
    trigger: traderRuleTriggerSchema,
    eventSide: z.enum(["BUY", "SELL"]),
    eventQuantity: z.number().int(),
    eventPrice: z.number().int(),
    sourceMessageId: z.number().int().nullable(),
    chatId: z.string().nullable(),
    alertStatus: traderRuleAlertStatusSchema,
    followStatus: traderRuleFollowStatusSchema,
    followSide: z.enum(["BUY", "SELL"]).nullable(),
    followQuantity: z.number().int().nullable(),
    followPrice: z.number().int().nullable(),
    outgoingMessageId: z.number().int().nullable(),
    errorMessage: z.string().nullable(),
    executedAt: z.string().datetime(),
  })
  .strict();

export type TraderRuleExecutionDto = z.infer<typeof traderRuleExecutionSchema>;
