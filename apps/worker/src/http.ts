import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { workerCommandSchema } from "@zarbit/contracts";
import { safeError } from "./errors";
import { sessionRef, workerLog } from "./logger";
import type { Sessions } from "./sessions";

export function createWorkerApp(
  sessions: Sessions,
  token: string,
  health: () => Promise<Record<string, number>>,
) {
  const app = new Hono();
  app.get("/health", async (c) => {
    try {
      return c.json({ ok: true, ...(await health()) });
    } catch (error) {
      workerLog.failure("database.health.failed", error);
      return c.json({ ok: false }, 503);
    }
  });
  app.use("/internal/*", bodyLimit({ maxSize: 8192 }));
  app.use("/internal/*", async (c, next) => {
    const value = c.req.header("Authorization") ?? "";
    const hash = (v: string) => createHash("sha256").update(v).digest();
    if (!timingSafeEqual(hash(value), hash(`Bearer ${token}`)))
      return c.json(
        { error: { code: "FORBIDDEN", message: "دسترسی مجاز نیست." } },
        403,
      );
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.post("/internal/command", async (c) => {
    const input = z
      .object({
        userId: z.string().min(1).max(100),
        command: workerCommandSchema,
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: { code: "INVALID_INPUT", message: "اطلاعات نامعتبر است." } },
        400,
      );
    try {
      return c.json({
        data: await sessions.command(input.data.userId, input.data.command),
      });
    } catch (error) {
      const safe = safeError(error);
      workerLog.failure("worker.command.failed", error, {
        command: input.data.command.type,
        sessionRef: sessionRef(input.data.userId),
      });
      return c.json(
        {
          error: {
            code: safe.code,
            message: safe.message,
            retryAt: safe.retryAt,
          },
        },
        safe.status as 400 | 403 | 404 | 409 | 429 | 503,
      );
    }
  });
  app.onError((_, c) =>
    c.json(
      {
        error: { code: "UNAVAILABLE", message: "سرویس موقتاً در دسترس نیست." },
      },
      503,
    ),
  );
  return app;
}
