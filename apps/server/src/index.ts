import { serve } from "@hono/node-server";
import { store, prisma, type Store } from "@zarbit/db";
import {
  AppError,
  requestInputSchema,
  workerCommandSchema,
  type WorkerCommand,
  type TelegramSessionStatus,
  type Identity,
  type ZarbitRequest,
} from "@zarbit/contracts";
import { compactQuoteToHumanPrice } from "@zarbit/domain";
import { env } from "@zarbit/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { authenticateTelegramRequest } from "./auth";
import { createTelegramBot } from "./telegram";
import { workerCommand } from "./telegram-session";

type AppEnv = {
  Variables: {
    user: {
      id: string;
      telegramUserId: string;
      firstName?: string;
      username?: string;
    };
  };
};
export function requestDto(
  r: NonNullable<Awaited<ReturnType<Store["request"]>>>,
): ZarbitRequest {
  return {
    id: r.id,
    condition: r.condition,
    action: r.action,
    units: r.units,
    targetPrice: compactQuoteToHumanPrice(r.targetPrice),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    triggeredQuote: r.triggeredQuote
      ? compactQuoteToHumanPrice(r.triggeredQuote)
      : null,
    failureReason: r.failureReason,
    cancellationReason: r.cancellationReason,
    isExecuting: r.status === "ACTIVE" && Boolean(r.claimToken),
  };
}
export function createApp(deps: {
  store: Store;
  authenticate: (initData: string | undefined) => Identity;
  command: (
    id: string,
    command: WorkerCommand,
  ) => Promise<TelegramSessionStatus>;
}) {
  const app = new Hono<AppEnv>();
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
  app.get("/", async (c) => {
    await deps.store.db.$queryRaw`SELECT 1`;
    return c.text("OK");
  });
  app.use("/api/*", async (c, next) => {
    let identity: Identity;
    try {
      let initData = c.req.header("X-Telegram-Init-Data");
      if (c.req.path === "/api/auth/telegram") {
        const body = (await c.req.json().catch(() => null)) as {
          initData?: unknown;
        } | null;
        if (typeof body?.initData === "string") initData = body.initData;
      }
      identity = deps.authenticate(initData);
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
  app.post("/api/auth/telegram", (c) => {
    const { id: _, ...identity } = c.get("user");
    return c.json({ data: identity });
  });
  app.get("/api/requests", async (c) => {
    const parsed = z
      .object({
        status: z
          .enum(["ACTIVE", "DONE", "FAILED", "CANCELLED", "HISTORY"])
          .optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .safeParse(c.req.query());
    if (!parsed.success)
      throw new AppError("INVALID_QUERY", "فیلتر درخواست نامعتبر است.", 400);
    const result = await deps.store.list(
      c.get("user").id,
      parsed.data.status,
      parsed.data.page,
    );
    return c.json({ data: { ...result, items: result.items.map(requestDto) } });
  });
  app.get("/api/requests/:id", async (c) => {
    const r = await deps.store.request(c.get("user").id, c.req.param("id"));
    if (!r) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
    return c.json({ data: requestDto(r) });
  });
  for (const method of ["post", "patch"] as const)
    app[method](
      method === "post" ? "/api/requests" : "/api/requests/:id",
      async (c) => {
        const parsed = requestInputSchema.safeParse(
          await c.req.json().catch(() => null),
        );
        if (!parsed.success)
          throw new AppError(
            "INVALID_REQUEST",
            parsed.error.issues.find((i) => /[\u0600-\u06ff]/.test(i.message))
              ?.message ?? "قیمت، تعداد و اطلاعات درخواست را بررسی کنید.",
            400,
          );
        const user = c.get("user");
        const state = await deps.command(user.id, { type: "membership" });
        if (!state.canManageRequests)
          throw new AppError(
            "SESSION_NOT_READY",
            state.error ?? "اتصال تلگرام هنوز آماده نیست.",
          );
        const r =
          method === "post"
            ? await deps.store.create(user.id, parsed.data)
            : await deps.store.edit(user.id, c.req.param("id")!, parsed.data);
        if (!r)
          throw new AppError(
            "REQUEST_LOCKED",
            "درخواست اجرا شده یا در حال اجراست؛ قابل ویرایش نیست.",
          );
        return c.json({ data: requestDto(r) }, method === "post" ? 201 : 200);
      },
    );
  app.delete("/api/requests/:id", async (c) => {
    if (!(await deps.store.cancel(c.get("user").id, c.req.param("id"))))
      throw new AppError(
        "REQUEST_LOCKED",
        "فقط درخواست اجرا‌نشده قابل لغو است.",
      );
    return c.json({ data: { cancelled: true } });
  });
  app.get("/api/telegram-session/status", async (c) =>
    c.json({ data: await deps.command(c.get("user").id, { type: "status" }) }),
  );
  app.post("/api/telegram-session/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = workerCommandSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      type: "login",
    });
    if (!parsed.success)
      throw new AppError(
        "INVALID_PHONE",
        "شماره را با کد کشور، مثل ‎+989121234567 وارد کنید.",
        400,
      );
    return c.json(
      { data: await deps.command(c.get("user").id, parsed.data) },
      201,
    );
  });
  for (const type of ["code", "password", "resend"] as const)
    app.post(`/api/telegram-session/login/:id/${type}`, async (c) => {
      const body =
        type === "resend" ? {} : await c.req.json().catch(() => null);
      const command = workerCommandSchema.safeParse({
        ...(body && typeof body === "object" ? body : {}),
        type,
        id: c.req.param("id"),
      });
      if (!command.success)
        throw new AppError("INVALID_LOGIN", "اطلاعات ورود را بررسی کنید.", 400);
      return c.json({
        data: await deps.command(c.get("user").id, command.data),
      });
    });
  app.delete("/api/telegram-session/login/:id", async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success)
      throw new AppError("INVALID_LOGIN", "ورود معتبر نیست.", 400);
    return c.json({
      data: await deps.command(c.get("user").id, {
        type: "cancel",
        id: id.data,
      }),
    });
  });
  app.post("/api/telegram-session/membership-check", async (c) =>
    c.json({
      data: await deps.command(c.get("user").id, { type: "membership" }),
    }),
  );
  app.delete("/api/telegram-session", async (c) => {
    const userId = c.get("user").id;
    // Persist revocation even when the worker is currently offline.
    await deps.store.disableSession(
      userId,
      "REVOKING",
      "قطع اتصال درخواست شده؛ درخواست‌های اجرا‌نشده لغو شدند.",
    );
    return c.json({ data: await deps.command(userId, { type: "revoke" }) });
  });
  app.onError((error, c) => {
    const safe =
      error instanceof AppError
        ? error
        : new AppError(
            "UNAVAILABLE",
            "سرویس موقتاً در دسترس نیست؛ دوباره تلاش کنید.",
            503,
          );
    if (!(error instanceof AppError))
      console.error("api.operation.failed", { path: c.req.routePath });
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
  return app;
}
export const app = createApp({
  store,
  authenticate: authenticateTelegramRequest,
  command: workerCommand,
});
export function startServer() {
  if (!env.TELEGRAM_BOT_TOKEN || !env.WORKER_INTERNAL_TOKEN)
    throw new Error(
      "TELEGRAM_BOT_TOKEN and WORKER_INTERNAL_TOKEN are required.",
    );
  const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, env.WEB_APP_URL);
  void bot.start().catch(() => console.error("telegram.bot.failed"));
  const server = serve({ fetch: app.fetch, port: 3000 });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (bot.isRunning()) await bot.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  };
  process.once("SIGTERM", () => {
    void stop();
  });
  process.once("SIGINT", () => {
    void stop();
  });
  return server;
}
