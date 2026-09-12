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
export const tradePointSchema = z
  .object({
    price: z.number().int().positive(),
    announcedAt: z.string().datetime(),
  })
  .strict();
export type TradePoint = z.infer<typeof tradePointSchema>;
export const quoteDashboardSchema = z
  .object({
    latest: quotePointSchema.nullable(),
    latestTrade: tradePointSchema.nullable().optional(),
    points: z.array(quotePointSchema),
  })
  .strict();
export type QuoteDashboard = z.infer<typeof quoteDashboardSchema>;
export const telegramSessionKindSchema = z.enum([
  "DISCONNECTED",
  "LOGIN_PENDING",
  "ACTIVE",
  "DEGRADED",
  "NOT_IN_GROUP",
  "REVOKING",
  "REVOKED",
  "ERROR",
]);
export type TelegramSessionKind = z.infer<typeof telegramSessionKindSchema>;
/** @deprecated Use TelegramSessionKind and the discriminated status union. */
export type TelegramSessionState = TelegramSessionKind | "PENDING_OTP";
export const telegramSessionReasonCodeSchema = z.enum([
  "NONE",
  "LOGIN_REQUIRED",
  "LOGIN_EXPIRED",
  "TELEGRAM_LOGGED_OUT",
  "SESSION_EXPIRED",
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_DUPLICATED",
  "SESSION_REVOKED",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
  "NETWORK_UNAVAILABLE",
  "GROUP_MEMBERSHIP_REQUIRED",
  "IDENTITY_MISMATCH",
  "WORKER_UNAVAILABLE",
  "RATE_LIMITED",
  "UNKNOWN_FAILURE",
]);
export type TelegramSessionReasonCode = z.infer<
  typeof telegramSessionReasonCodeSchema
>;
export const sessionCapabilitiesSchema = z
  .object({
    canLogin: z.boolean(),
    canCreateRequest: z.boolean(),
    canCheckMembership: z.boolean(),
    canRevoke: z.boolean(),
  })
  .strict();
export type SessionCapabilities = z.infer<typeof sessionCapabilitiesSchema>;
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
const sessionCommon = z
  .object({
    reasonCode: telegramSessionReasonCodeSchema,
    observedAt: z.string().datetime(),
    stateChangedAt: z.string().datetime(),
    retryAt: z.string().datetime().nullable(),
    capabilities: sessionCapabilitiesSchema,
    groupId: z.number().int().safe().nullable(),
    quoteSenderId: z.string().nullable(),
    connectedTelegramUserId: z.string().nullable(),
    membershipCheckedAt: z.string().datetime().nullable(),
    login: loginStatusSchema.nullable(),
    state: telegramSessionKindSchema.optional(),
    error: z.string().nullable().optional(),
  })
  .strict();
export const telegramSessionStatusSchema = z.discriminatedUnion("kind", [
  sessionCommon.extend({
    kind: z.literal("DISCONNECTED"),
    connection: z.literal("OFFLINE"),
    reasonCode: z.enum(["LOGIN_REQUIRED", "LOGIN_EXPIRED"]),
    login: z.null(),
  }),
  sessionCommon.extend({
    kind: z.literal("LOGIN_PENDING"),
    connection: z.literal("CONNECTING"),
    phase: z.enum(["VERIFYING", "CODE", "PASSWORD"]),
    login: loginStatusSchema,
  }),
  sessionCommon.extend({
    kind: z.literal("ACTIVE"),
    connection: z.literal("CONNECTED"),
    reasonCode: z.literal("NONE"),
    login: z.null(),
  }),
  sessionCommon.extend({
    kind: z.literal("DEGRADED"),
    connection: z.enum(["OFFLINE", "CONNECTING"]),
    reasonCode: z.enum(["NETWORK_UNAVAILABLE", "WORKER_UNAVAILABLE"]),
    login: z.null(),
  }),
  sessionCommon.extend({
    kind: z.literal("NOT_IN_GROUP"),
    connection: z.enum(["CONNECTED", "OFFLINE"]),
    reasonCode: z.literal("GROUP_MEMBERSHIP_REQUIRED"),
    login: z.null(),
  }),
  sessionCommon.extend({
    kind: z.literal("REVOKING"),
    connection: z.enum(["CONNECTED", "OFFLINE"]),
    reasonCode: z.literal("NONE"),
    login: z.null(),
  }),
  sessionCommon.extend({
    kind: z.literal("REVOKED"),
    connection: z.literal("OFFLINE"),
    reasonCode: z.enum([
      "TELEGRAM_LOGGED_OUT",
      "SESSION_EXPIRED",
      "AUTH_KEY_UNREGISTERED",
      "AUTH_KEY_DUPLICATED",
      "SESSION_REVOKED",
      "USER_DEACTIVATED",
      "USER_DEACTIVATED_BAN",
      "IDENTITY_MISMATCH",
    ]),
    login: z.null(),
  }),
  sessionCommon.extend({
    kind: z.literal("ERROR"),
    connection: z.enum(["OFFLINE", "CONNECTING"]),
    reasonCode: z.enum(["UNKNOWN_FAILURE", "RATE_LIMITED"]),
    login: z.null(),
  }),
]);
export type TelegramSessionStatusV2 = z.infer<
  typeof telegramSessionStatusSchema
>;
/** @deprecated Accepted only at TypeScript integration seams while clients roll forward. */
type LegacyTelegramSessionStatus = {
  state: TelegramSessionKind | "PENDING_OTP";
  connection: "CONNECTED" | "CONNECTING" | "OFFLINE" | "DEGRADED";
  groupId: number | null;
  quoteSenderId: string | null;
  connectedTelegramUserId: string | null;
  membershipCheckedAt: string | null;
  error: string | null;
  login: LoginStatus | null;
  kind?: TelegramSessionKind;
  phase?: "VERIFYING" | "CODE" | "PASSWORD";
  observedAt?: string;
  stateChangedAt?: string;
  retryAt?: string | null;
  capabilities?: SessionCapabilities;
};
export type TelegramSessionStatus =
  z.infer<typeof telegramSessionStatusSchema> | LegacyTelegramSessionStatus;
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
export const requestExecutionPhaseSchema = z.enum([
  "WAITING_QUOTE",
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
  executionPhase: requestExecutionPhaseSchema.optional(),
  outcomeCode: z.string().nullable().optional(),
  deliveryStartedAt: z.string().datetime().nullable().optional(),
  unknownReason: z.string().nullable().optional(),
  resolutionState: requestResolutionStateSchema.optional(),
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
