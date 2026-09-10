import { AppError, workerCommandSchema } from "@zarbit/contracts";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDependencies } from "../../app-dependencies";
import type { AppEnv } from "../../transport/http/app-env";

function commandInput(value: unknown): object {
  return value && typeof value === "object" ? value : {};
}

export function registerTelegramSessionRoutes(
  app: Hono<AppEnv>,
  deps: AppDependencies,
) {
  app.get("/api/telegram-session/status", async (c) =>
    c.json({ data: await deps.command(c.get("user").id, { type: "status" }) }),
  );

  app.post("/api/telegram-session/login", async (c) => {
    const parsed = workerCommandSchema.safeParse({
      ...commandInput(await c.req.json().catch(() => null)),
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

  for (const type of ["code", "password", "resend"] as const) {
    app.post(`/api/telegram-session/login/:id/${type}`, async (c) => {
      const body =
        type === "resend" ? {} : await c.req.json().catch(() => null);
      const command = workerCommandSchema.safeParse({
        ...commandInput(body),
        type,
        id: c.req.param("id"),
      });

      if (!command.success)
        throw new AppError("INVALID_LOGIN", "اطلاعات ورود را بررسی کنید.", 400);

      return c.json({
        data: await deps.command(c.get("user").id, command.data),
      });
    });
  }

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
      "قطع اتصال درخواست شده؛ وضعیت درخواست‌های خود را بررسی کنید.",
    );

    return c.json({ data: await deps.command(userId, { type: "revoke" }) });
  });
}
