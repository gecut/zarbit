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
export const requestInputSchema = z
  .object({
    condition: z.enum(["LTE", "GTE"]),
    targetPrice: z
      .number()
      .int()
      .positive()
      .max(2_147_483_647_000)
      .refine((n) => n % 1000 === 0, "قیمت باید مضربی از ۱٬۰۰۰ ریال باشد."),
    action: z.enum(["ALERT", "BUY", "SELL"]),
    units: z.number().int().positive().max(2_147_483_647).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action !== "ALERT" && value.units === null)
      ctx.addIssue({
        code: "custom",
        message: "تعداد واحد برای خرید و فروش الزامی است.",
        path: ["units"],
      });
    if (value.action === "ALERT" && value.units !== null)
      ctx.addIssue({
        code: "custom",
        message: "درخواست هشدار تعداد واحد ندارد.",
        path: ["units"],
      });
  });
export type RequestPayload = z.infer<typeof requestInputSchema>;
export type RequestAction = RequestPayload["action"];
export type RequestCondition = RequestPayload["condition"];
export type RequestStatus = "ACTIVE" | "DONE" | "CANCELLED" | "FAILED";
export interface ZarbitRequest extends RequestPayload {
  id: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  triggeredQuote: number | null;
  completedAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
  isExecuting: boolean;
}
export interface RequestPage {
  items: ZarbitRequest[];
  total: number;
  page: number;
  pageSize: number;
  activeCount: number;
}
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
  connection: z.enum(["CONNECTED", "CONNECTING", "OFFLINE"]),
  connectedTelegramUserId: z.string().nullable(),
  membershipCheckedAt: z.string().nullable(),
  canManageRequests: z.boolean(),
  error: z.string().nullable(),
  login: loginStatusSchema.nullable(),
});
export type TelegramSessionStatus = z.infer<typeof telegramSessionStatusSchema>;
export interface Identity {
  telegramUserId: string;
  firstName?: string;
  username?: string;
}
export const workerCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status") }).strict(),
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
