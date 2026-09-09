import { z } from "zod";

export const normalizeDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

export const phoneSchema = z
  .string()
  .max(40)
  .transform((value) => normalizeDigits(value).replace(/[ ()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{6,14}$/,
        "شماره را با کد کشور وارد کنید؛ مثلاً ‎+989121234567.",
      ),
  );
export const loginSchema = z.object({ phone: phoneSchema }).strict();
export const codeSchema = z
  .object({
    code: z.string().trim().min(1).max(128).transform(normalizeDigits),
  })
  .strict();
export const passwordSchema = z
  .object({ password: z.string().min(1).max(1024) })
  .strict();
export const quotePointSchema = z
  .object({
    quote: z.number().int().positive(),
    announcedAt: z.string().datetime(),
  })
  .strict();
export type QuotePoint = z.infer<typeof quotePointSchema>;
export const quoteDashboardSchema = z
  .object({
    latest: quotePointSchema.nullable(),
    points: z.array(quotePointSchema),
  })
  .strict();
export type QuoteDashboard = z.infer<typeof quoteDashboardSchema>;
export const telegramSessionStateSchema = z.enum([
  "DISCONNECTED",
  "PENDING_OTP",
  "ACTIVE",
  "NOT_IN_GROUP",
  "REVOKING",
  "REVOKED",
  "ERROR",
]);
export type TelegramSessionState = z.infer<typeof telegramSessionStateSchema>;
export const loginStatusSchema = z.object({
  id: z.string().uuid(),
  step: z.enum(["CODE", "PASSWORD", "VERIFYING"]),
  expiresAt: z.string(),
  resendAvailableAt: z.string().nullable(),
  delivery: z.string(),
  codeLength: z.number().int().nullable(),
  maskedPhone: z.string(),
  error: z.string().nullable(),
});
export type LoginStatus = z.infer<typeof loginStatusSchema>;
export const telegramSessionStatusSchema = z.object({
  state: telegramSessionStateSchema,
  connection: z.enum(["CONNECTED", "CONNECTING", "OFFLINE", "DEGRADED"]),
  groupId: z.number().int().safe().nullable(),
  quoteSenderId: z.string().nullable(),
  connectedTelegramUserId: z.string().nullable(),
  membershipCheckedAt: z.string().nullable(),
  error: z.string().nullable(),
  login: loginStatusSchema.nullable(),
});
export type TelegramSessionStatus = z.infer<typeof telegramSessionStatusSchema>;
export interface Identity {
  telegramUserId: string;
  firstName?: string;
  username?: string;
}
export const sessionCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("login"), ...loginSchema.shape }).strict(),
  z
    .object({
      type: z.literal("code"),
      id: z.string().uuid(),
      ...codeSchema.shape,
    })
    .strict(),
  z
    .object({
      type: z.literal("password"),
      id: z.string().uuid(),
      ...passwordSchema.shape,
    })
    .strict(),
  z.object({ type: z.literal("resend"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("cancel"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("membership") }).strict(),
  z.object({ type: z.literal("revoke") }).strict(),
]);
export const workerCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status") }).strict(),
  z
    .object({ type: z.literal("force-send"), id: z.string().min(1).max(100) })
    .strict(),
  ...sessionCommandSchema.options,
]);
export type WorkerCommand = z.infer<typeof workerCommandSchema>;
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly retryAt?: string,
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
const requestFields = z
  .object({
    condition: requestConditionSchema,
    action: requestActionSchema,
    targetPrice: requestInteger,
    units: requestInteger.nullable(),
  })
  .strict();
export const createRequestInputSchema = requestFields.refine(
  (value) =>
    value.action === "ALERT" ? value.units === null : value.units !== null,
  {
    message: "برای خرید و فروش تعداد را وارد کنید؛ هشدار تعداد ندارد.",
    path: ["units"],
  },
);
// Editing replaces the complete editable payload, preserving cross-field validation.
export const updateRequestInputSchema = createRequestInputSchema;
export type CreateRequestInput = z.infer<typeof createRequestInputSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestInputSchema>;
export const requestSchema = requestFields.extend({
  id: z.string(),
  status: requestStatusSchema,
  executing: z.boolean(),
  triggeredQuote: requestInteger.nullable(),
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
