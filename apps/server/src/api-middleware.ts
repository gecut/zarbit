import { env } from "@zarbit/env/server";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

import type { AppDependencies, AppEnv } from "./app-types";

function initDataFromBody(value: unknown): string | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("initData" in value)
  )
    return undefined;

  return typeof value.initData === "string" ? value.initData : undefined;
}

export function registerApiMiddleware(
  app: Hono<AppEnv>,
  deps: AppDependencies,
) {
  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGIN,
      allowHeaders: ["Content-Type", "X-Telegram-Init-Data"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16_384,
      onError: (c) =>
        c.json(
          {
            error: {
              code: "TOO_LARGE",
              message: "اطلاعات ارسالی بیش از حد بزرگ است.",
            },
          },
          413,
        ),
    }),
  );

  app.use("/api/*", async (c, next) => {
    let identity: ReturnType<AppDependencies["authenticate"]>;

    try {
      const headerInitData = c.req.header("X-Telegram-Init-Data");
      const bodyInitData =
        c.req.path === "/api/auth/telegram"
          ? initDataFromBody(await c.req.json().catch(() => null))
          : undefined;
      identity = deps.authenticate(bodyInitData ?? headerInitData);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message:
              error instanceof Error ? error.message : "ورود نامعتبر است.",
          },
        },
        401,
      );
    }

    const user = await deps.store.user(identity);
    c.set("user", { id: user.id, ...identity });

    await next();
  });
}
