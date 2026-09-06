import { tl } from "@mtcute/node";
import { AppError } from "@zarbit/contracts";

export type FailureCategory =
  "application" | "database" | "network" | "telegram_rpc" | "unknown";

export interface ErrorDetails {
  errorCode: string;
  failureCategory: FailureCategory;
  sourceCode?: string;
}

const safeCode = (value: string | undefined) =>
  value && /^[A-Z][A-Z0-9_]{1,99}$/.test(value) ? value : undefined;

export const stringProperty = (error: unknown, key: string) => {
  if (!error || typeof error !== "object" || !(key in error)) return;
  const value = Reflect.get(error, key);
  return typeof value === "string" ? value : undefined;
};

/** Returns only a Telegram RPC code; native Node errors intentionally do not pass here. */
export function rpcCode(error: unknown): string | undefined {
  if (tl.RpcError.is(error)) return error.text;
  return safeCode(stringProperty(error, "errorMessage"));
}

const nativeCode = (error: unknown) => safeCode(stringProperty(error, "code"));

const isNetworkCode = (code: string) =>
  /^(?:EAI_AGAIN|ECONN|ENET|EHOST|ETIMEDOUT|ECANCELED|NETWORK_ERROR)/.test(
    code,
  );

export function errorDetails(error: unknown): ErrorDetails {
  if (error instanceof AppError)
    return {
      errorCode: error.code,
      failureCategory: "application",
      ...(safeCode(error.code) ? { sourceCode: error.code } : {}),
    };

  const rpc = rpcCode(error);
  if (rpc)
    return {
      errorCode: rpc,
      failureCategory: "telegram_rpc",
      sourceCode: rpc,
    };

  const native = nativeCode(error);
  if (error instanceof Error && error.name.startsWith("Prisma"))
    return {
      errorCode: native ?? "DATABASE_ERROR",
      failureCategory: "database",
      ...(native ? { sourceCode: native } : {}),
    };
  if (native && isNetworkCode(native))
    return {
      errorCode: native,
      failureCategory: "network",
      sourceCode: native,
    };
  return {
    errorCode: native ?? "NETWORK_ERROR",
    failureCategory: "unknown",
    ...(native ? { sourceCode: native } : {}),
  };
}

export const isRevoked = (error: unknown) =>
  /^(AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|USER_DEACTIVATED_BAN)$/.test(
    rpcCode(error) ?? "",
  );

export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const code = rpcCode(error);
  const flood = code && /^FLOOD(?:_PREMIUM)?_WAIT_(\d+)$/.exec(code);
  if (flood)
    return new AppError(
      "RATE_LIMITED",
      "تلگرام درخواست‌های بیشتری نمی‌پذیرد؛ پس از زمان اعلام‌شده دوباره تلاش کنید.",
      429,
      new Date(Date.now() + Number(flood[1]) * 1000).toISOString(),
    );
  if (
    code &&
    [
      "PHONE_CODE_HASH_EMPTY",
      "PHONE_CODE_HASH_INVALID",
      "SESSION_REVOKED",
      "SESSION_EXPIRED",
      "AUTH_KEY_UNREGISTERED",
      "AUTH_KEY_DUPLICATED",
    ].includes(code)
  )
    return new AppError(
      "LOGIN_EXPIRED",
      "فرایند ورود معتبر نیست؛ دوباره وارد شوید.",
      400,
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
    code && messages[code] ? code : "TELEGRAM_UNAVAILABLE",
    (code && messages[code]) ??
      "ارتباط با تلگرام برقرار نشد؛ دوباره تلاش کنید.",
    code && messages[code] ? 400 : 503,
  );
}
