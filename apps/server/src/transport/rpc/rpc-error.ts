import { ORPCError, ValidationError } from "@orpc/server";
import { AppError } from "@zarbit/contracts";

export function rpcError(
  error: unknown,
  requestId = "unknown",
): ORPCError<string, unknown> {
  if (error instanceof ORPCError) {
    if (error.code === "BAD_REQUEST") {
      const paths =
        error.cause instanceof ValidationError
          ? error.cause.issues.flatMap((issue) =>
              (issue.path ?? []).map((part) =>
                typeof part === "object" && part !== null ? part.key : part,
              ),
            )
          : [];
      const field = paths.includes("phone")
        ? "phone"
        : paths.includes("code")
          ? "code"
          : paths.includes("password")
            ? "password"
            : undefined;
      const message =
        field === "phone"
          ? "شماره را با کد کشور وارد کنید؛ مثلاً +989121234567."
          : field === "code"
            ? "کد ورود را وارد کنید."
            : field === "password"
              ? "رمز دوم تلگرام را وارد کنید."
              : "اطلاعات ارسالی را بررسی کنید.";
      return new ORPCError("BAD_REQUEST", {
        message,
        data: {
          field,
          appCode: "INVALID_INPUT",
          reasonCode: "INVALID_INPUT",
          messageKey: "INVALID_INPUT",
          requestId,
        },
      });
    }
    if (error.code === "INTERNAL_SERVER_ERROR")
      return rpcError(
        new AppError(
          "INVALID_RESPONSE",
          "پاسخ سرویس معتبر نیست؛ کمی بعد تلاش کنید.",
          503,
        ),
        requestId,
      );
    return error;
  }
  const safe =
    error instanceof AppError
      ? error
      : new AppError(
          "UNAVAILABLE",
          "سرویس موقتاً در دسترس نیست؛ دوباره تلاش کنید.",
          503,
        );
  const codes: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "TOO_MANY_REQUESTS",
    503: "SERVICE_UNAVAILABLE",
  };
  return new ORPCError(codes[safe.status] ?? "SERVICE_UNAVAILABLE", {
    message: safe.message,
    data: {
      field: safe.details?.field,
      appCode: safe.code,
      reasonCode: safe.code,
      messageKey: safe.code,
      requestId,
      retryAt: safe.retryAt,
      retryAfter: safe.retryAt
        ? Math.max(0, Math.ceil((Date.parse(safe.retryAt) - Date.now()) / 1000))
        : undefined,
    },
  });
}
