import { ORPCError } from "@orpc/server";
import { AppError } from "@zarbit/contracts";

export function rpcError(
  error: unknown,
  requestId = "unknown",
): ORPCError<string, unknown> {
  if (error instanceof ORPCError) {
    if (error.code === "BAD_REQUEST")
      return new ORPCError("BAD_REQUEST", {
        message: "اطلاعات ارسالی را بررسی کنید.",
        data: {
          appCode: "INVALID_INPUT",
          reasonCode: "INVALID_INPUT",
          messageKey: "INVALID_INPUT",
          requestId,
        },
      });
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
