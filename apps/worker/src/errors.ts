import { AppError } from "@zarbit/contracts";

export function rpcCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "errorMessage" in error &&
    typeof error.errorMessage === "string"
  )
    return error.errorMessage;
  return error instanceof AppError ? error.code : "NETWORK_ERROR";
}
export const isRevoked = (error: unknown) =>
  /^(AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|USER_DEACTIVATED_BAN)$/.test(
    rpcCode(error),
  );
export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const code = rpcCode(error);
  const flood = /^FLOOD(?:_PREMIUM)?_WAIT_(\d+)$/.exec(code);
  if (flood)
    return new AppError(
      "RATE_LIMITED",
      "تلگرام درخواست‌های بیشتری نمی‌پذیرد؛ پس از زمان اعلام‌شده دوباره تلاش کنید.",
      429,
      new Date(Date.now() + Number(flood[1]) * 1000).toISOString(),
    );
  const messages: Record<string, string> = {
    PHONE_NUMBER_INVALID: "شماره تلفن معتبر نیست.",
    PHONE_NUMBER_BANNED: "این شماره از طرف تلگرام مسدود شده است.",
    PHONE_CODE_INVALID: "کد واردشده درست نیست.",
    PHONE_CODE_EXPIRED: "کد ورود منقضی شده است؛ دوباره وارد شوید.",
    PASSWORD_HASH_INVALID: "رمز دوم درست نیست.",
    SESSION_PASSWORD_NEEDED: "رمز دوم حساب تلگرام را وارد کنید.",
    PHONE_NUMBER_UNOCCUPIED:
      "ابتدا حساب خود را در برنامه رسمی تلگرام ایجاد کنید.",
  };
  return new AppError(
    messages[code] ? code : "TELEGRAM_UNAVAILABLE",
    messages[code] ?? "ارتباط با تلگرام برقرار نشد؛ دوباره تلاش کنید.",
    messages[code] ? 400 : 503,
  );
}
