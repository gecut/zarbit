import { z } from "zod";
export * from "./login-input";
export * from "./market";
export * from "./telegram";
export interface Identity {
  telegramUserId: string;
  firstName?: string;
  username?: string;
}
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly retryAt?: string,
    public readonly details?: {
      field?: "phone" | "code" | "password";
      requestId?: string;
    },
  ) {
    super(message);
  }
}

const requestInteger = z.number().int().positive().max(2_147_483_647);
export const requestConditionSchema = z.enum(["GTE", "LTE"]);
export const requestActionSchema = z.enum(["ALERT", "BUY", "SELL"]);
export const requestStatusSchema = z.enum([
  "ACTIVE",
  "DONE",
  "CANCELLED",
  "FAILED",
  "UNKNOWN",
]);
export const requestExecutionPhaseSchema = z.enum([
  "WAITING_TRADE",
  "CLAIMED",
  "SENDING",
  "DONE",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
]);
export const requestResolutionStateSchema = z.enum([
  "NOT_APPLICABLE",
  "UNRESOLVED",
]);
const baseRequestFields = z
  .object({
    condition: requestConditionSchema,
    action: requestActionSchema,
    targetPrice: requestInteger,
    units: requestInteger.nullable(),
  })
  .strict();

export const updateRequestInputSchema = baseRequestFields.refine(
  (value) =>
    value.action === "ALERT" ? value.units === null : value.units !== null,
  {
    message: "برای خرید و فروش تعداد را وارد کنید؛ هشدار تعداد ندارد.",
    path: ["units"],
  },
);

export const createRequestInputSchema = baseRequestFields
  .extend({
    creationKey: z.string().uuid({ message: "شناسه یکتای ثبت نامعتبر است." }),
  })
  .strict()
  .refine(
    (value) =>
      value.action === "ALERT" ? value.units === null : value.units !== null,
    {
      message: "برای خرید و فروش تعداد را وارد کنید؛ هشدار تعداد ندارد.",
      path: ["units"],
    },
  );

export type CreateRequestInput = z.infer<typeof createRequestInputSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestInputSchema>;
export const requestSchema = baseRequestFields.extend({
  id: z.string(),
  status: requestStatusSchema,
  executing: z.boolean(),
  executionPhase: requestExecutionPhaseSchema.optional(),
  outcomeCode: z.string().nullable().optional(),
  deliveryStartedAt: z.string().datetime().nullable().optional(),
  unknownReason: z.string().nullable().optional(),
  resolutionState: requestResolutionStateSchema.optional(),
  triggeredPrice: requestInteger.nullable(),
  triggerSource: z.enum(["QUOTE", "TRADE"]).nullable(),
  triggeredTradeId: z.string().nullable(),
  triggeredAt: z.string().datetime().nullable(),
  triggeredMessageId: z.number().int().nullable(),
  outgoingMessageId: z.number().int().nullable(),
  completedAt: z.string().datetime().nullable(),
  failureReason: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const requestListItemSchema = requestSchema;
export const requestDetailSchema = requestSchema;
export type Request = z.infer<typeof requestSchema>;
export type RequestListItem = z.infer<typeof requestListItemSchema>;
export type RequestDetail = z.infer<typeof requestDetailSchema>;
export const requestHistoryPageSchema = z
  .object({
    items: z.array(requestListItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type RequestHistoryPage = z.infer<typeof requestHistoryPageSchema>;

// Reserved for authenticated, read-only service diagnostics.
export const WORKER_DIAGNOSTIC_USER_ID = "__zarbit_worker_diagnostic__";

export * from "./analytics";
