import { z } from "zod";
import { loginSchema, codeSchema, passwordSchema } from "./login-input";

export const TELEGRAM_CONTRACT_VERSION = 3;
export const TELEGRAM_CONTRACT_HEADER = "X-Zarbit-Telegram-Contract";
export const telegramIssueSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    field: z.enum(["phone", "code", "password"]).optional(),
    retryAt: z.string().datetime().optional(),
    requestId: z.string().optional(),
  })
  .strict();
export type TelegramIssue = z.infer<typeof telegramIssueSchema>;

export const loginStatusSchema = z
  .object({
    id: z.string().uuid(),
    step: z.enum([
      "SENDING_CODE",
      "CODE",
      "VERIFYING_CODE",
      "PASSWORD",
      "VERIFYING_PASSWORD",
    ]),
    expiresAt: z.string().datetime(),
    resendAvailableAt: z.string().datetime().nullable(),
    retryAt: z.string().datetime().nullable(),
    delivery: z.string(),
    codeLength: z.number().int().min(0).max(128).nullable(),
    maskedPhone: z.string(),
    error: z.string().nullable(),
  })
  .strict();
export type LoginStatus = z.infer<typeof loginStatusSchema>;

export const sessionCapabilitiesSchema = z
  .object({
    canLogin: z.boolean(),
    canSubmitCode: z.boolean(),
    canSubmitPassword: z.boolean(),
    canResend: z.boolean(),
    canCancelLogin: z.boolean(),
    canCreateRequest: z.boolean(),
    canCheckMembership: z.boolean(),
    canRevoke: z.boolean(),
  })
  .strict();
export type SessionCapabilities = z.infer<typeof sessionCapabilitiesSchema>;

const sessionFactsSchema = z
  .object({
    contractVersion: z.literal(TELEGRAM_CONTRACT_VERSION),
    authorization: z.enum([
      "DISCONNECTED",
      "LOGIN_PENDING",
      "AUTHORIZED",
      "REVOKING",
      "REVOKED",
      "ERROR",
    ]),
    worker: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    connection: z.enum([
      "CONNECTED",
      "CONNECTING",
      "OFFLINE",
      "DEGRADED",
      "UNKNOWN",
    ]),
    membership: z.enum(["UNKNOWN", "MEMBER", "NOT_MEMBER"]),
    source: z.enum(["LIVE", "STORED"]),
    revision: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
    observedAt: z.string().datetime(),
    stateChangedAt: z.string().datetime(),
    retryAt: z.string().datetime().nullable(),
    activeOperationId: z.string().uuid().nullable(),
    challengeId: z.string().uuid().nullable(),
    groupId: z.number().int().safe().nullable(),
    quoteSenderId: z.string().nullable(),
    connectedTelegramUserId: z.string().nullable(),
    membershipCheckedAt: z.string().datetime().nullable(),
    login: loginStatusSchema.nullable(),
    issue: telegramIssueSchema.nullable(),
  })
  .strict();
export type TelegramSessionFacts = z.infer<typeof sessionFactsSchema>;
export const telegramSessionStatusSchema = sessionFactsSchema
  .extend({
    capabilities: sessionCapabilitiesSchema,
  })
  .superRefine((value, context) => {
    if (value.login && value.authorization !== "LOGIN_PENDING")
      context.addIssue({
        code: "custom",
        message: "Challenge requires pending authorization",
        path: ["login"],
      });
    if (
      value.source === "LIVE" &&
      value.authorization === "LOGIN_PENDING" &&
      !value.login
    )
      context.addIssue({
        code: "custom",
        message: "Live login requires challenge",
        path: ["login"],
      });
    if (value.authorization === "AUTHORIZED" && !value.connectedTelegramUserId)
      context.addIssue({
        code: "custom",
        message: "Authorized account requires identity",
        path: ["connectedTelegramUserId"],
      });
    if (value.worker === "UNAVAILABLE" && value.source !== "STORED")
      context.addIssue({
        code: "custom",
        message: "Unavailable worker requires stored snapshot",
        path: ["source"],
      });
  });
export type TelegramSessionStatus = z.infer<typeof telegramSessionStatusSchema>;

/** Capabilities are derived from facts; callers still authorize every command. */
export function presentTelegramSession(
  facts: TelegramSessionFacts,
  now = Date.now(),
): TelegramSessionStatus {
  const live = facts.worker === "AVAILABLE";
  const idle = !facts.activeOperationId;
  const login = facts.login;
  const validLogin = !!login && Date.parse(login.expiresAt) > now;
  const unblocked = !login?.retryAt || Date.parse(login.retryAt) <= now;
  const authorized = facts.authorization === "AUTHORIZED";
  return telegramSessionStatusSchema.parse({
    ...facts,
    capabilities: {
      canLogin:
        live &&
        idle &&
        !login &&
        ["DISCONNECTED", "REVOKED", "ERROR"].includes(facts.authorization) &&
        (!facts.retryAt || Date.parse(facts.retryAt) <= now),
      canSubmitCode:
        live && idle && validLogin && unblocked && login?.step === "CODE",
      canSubmitPassword:
        live && idle && validLogin && unblocked && login?.step === "PASSWORD",
      canResend:
        live &&
        idle &&
        validLogin &&
        unblocked &&
        login?.step === "CODE" &&
        !!login.resendAvailableAt &&
        Date.parse(login.resendAvailableAt) <= now,
      canCancelLogin: facts.authorization === "LOGIN_PENDING",
      canCreateRequest:
        live &&
        authorized &&
        facts.connection === "CONNECTED" &&
        facts.membership === "MEMBER",
      canCheckMembership: live && idle && authorized,
      canRevoke:
        authorized ||
        (facts.authorization === "ERROR" && !!facts.connectedTelegramUserId),
    },
  });
}

export const telegramOperationStatusSchema = z.enum([
  "ACCEPTED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "INTERRUPTED",
]);
export const telegramOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    type: z.enum([
      "login",
      "code",
      "password",
      "resend",
      "cancel",
      "membership",
      "revoke",
    ]),
    status: telegramOperationStatusSchema,
    revision: z.number().int().nonnegative(),
    challengeId: z.string().uuid().nullable(),
    requestId: z.string(),
    acceptedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    issue: telegramIssueSchema.nullable(),
    cancelledRequests: z.number().int().nonnegative(),
    sendingRequests: z.number().int().nonnegative(),
  })
  .strict();
export type TelegramOperation = z.infer<typeof telegramOperationSchema>;
export function isTelegramOperationPending(
  operation: Pick<TelegramOperation, "status">,
): boolean {
  return ["ACCEPTED", "RUNNING", "CANCEL_REQUESTED"].includes(operation.status);
}
export const telegramCommandReceiptSchema = z
  .object({
    operationId: z.string().uuid(),
    acceptedAt: z.string().datetime(),
  })
  .strict();
export type TelegramCommandReceipt = z.infer<
  typeof telegramCommandReceiptSchema
>;

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

export const telegramCommandInputSchema = z
  .object({ operationId: z.string().uuid(), command: sessionCommandSchema })
  .strict();
export type TelegramCommandInput = z.infer<typeof telegramCommandInputSchema>;
