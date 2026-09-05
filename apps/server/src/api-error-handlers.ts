import { AppError } from "@zarbit/contracts";
import { databasePoolStats } from "@zarbit/db";
import type { Hono } from "hono";

import type { AppEnv } from "./app-types";

export function registerApiErrorHandlers(app: Hono<AppEnv>) {
  app.onError((error, c) => {
    const safe =
      error instanceof AppError
        ? error
        : new AppError(
            "UNAVAILABLE",
            "سرویس موقتاً در دسترس نیست؛ دوباره تلاش کنید.",
            503,
          );

    if (!(error instanceof AppError)) {
      const databaseFailure =
        error instanceof Error && error.name.startsWith("Prisma");
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: "server",
          level: "error",
          event: "api.operation.failed",
          path: c.req.path,
          errorCode: databaseFailure ? "DATABASE_ERROR" : "UNAVAILABLE",
          failureCategory: databaseFailure ? "database" : "unknown",
          ...databasePoolStats(),
        }),
      );
    }

    return c.json(
      {
        error: {
          code: safe.code,
          message: safe.message,
          retryAt: safe.retryAt,
        },
      },
      safe.status as 400 | 404 | 409 | 429 | 503,
    );
  });

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "مسیر پیدا نشد؛ برنامه را به‌روز کنید.",
        },
      },
      404,
    ),
  );
}
