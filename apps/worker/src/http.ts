import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  WORKER_DIAGNOSTIC_USER_ID,
  workerCommandSchema,
  telegramCommandInputSchema,
} from "@zarbit/contracts";
import type { SessionOperations } from "./session-operations";
import { safeError } from "./errors";
import { sessionRef, workerLog } from "./logger";
import type { Sessions } from "./sessions";

export function createWorkerApp(
  sessions: Sessions,
  token: string,
  health: () => Promise<Record<string, number>>,
  operations?: Pick<SessionOperations, "accept">,
) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    const incoming = c.req.header("X-Request-Id") ?? "";
    const requestId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        incoming,
      )
        ? incoming
        : randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    await next();
  });
  app.get("/health", async (c) => {
    const startedAt = Date.now();
    try {
      const result = {
        ...(await health()),
        ...sessions.runtimeHealth(),
        uptimeSeconds: Math.floor(process.uptime()),
        releaseId: process.env.RELEASE_ID ?? null,
        httpReady: true,
      };
      workerLog.debug("worker.health.completed", {
        durationMs: Date.now() - startedAt,
        requestId: c.get("requestId"),
        ...result,
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      workerLog.failure("database.health.failed", error, {
        durationMs: Date.now() - startedAt,
        requestId: c.get("requestId"),
      });
      return c.json({ ok: false }, 503);
    }
  });
  app.use("/internal/*", bodyLimit({ maxSize: 8192 }));
  app.use("/internal/*", async (c, next) => {
    const value = c.req.header("Authorization") ?? "";
    const hash = (v: string) => createHash("sha256").update(v).digest();
    if (!timingSafeEqual(hash(value), hash(`Bearer ${token}`))) {
      workerLog.warn("worker.internal.unauthorized", {
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status: 403,
      });
      return c.json(
        {
          error: {
            code: "INTERNAL_AUTH_INVALID",
            message: "ارتباط سرویس‌ها معتبر نیست.",
          },
        },
        403,
      );
    }
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.post("/internal/command", async (c) => {
    const startedAt = Date.now();
    const input = z
      .object({
        userId: z.string().min(1).max(100),
        command: workerCommandSchema,
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) {
      workerLog.warn("worker.command.invalid", {
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status: 400,
      });
      return c.json(
        { error: { code: "INVALID_INPUT", message: "اطلاعات نامعتبر است." } },
        400,
      );
    }
    if (!["status", "force-send"].includes(input.data.command.type))
      return c.json(
        {
          error: {
            code: "CLIENT_UPDATE_REQUIRED",
            message: "برنامه را به‌روز کنید.",
          },
        },
        409,
      );
    const logCommand =
      input.data.command.type === "status" ? workerLog.debug : workerLog.info;
    logCommand("worker.command.started", {
      requestId: c.get("requestId"),
      command: input.data.command.type,
      sessionRef: sessionRef(input.data.userId),
    });
    try {
      const diagnostic = input.data.userId === WORKER_DIAGNOSTIC_USER_ID;
      if (diagnostic && input.data.command.type !== "status") {
        return c.json(
          { error: { code: "FORBIDDEN", message: "دسترسی مجاز نیست." } },
          403,
        );
      }
      if (diagnostic) await health();
      const data = diagnostic
        ? await sessions.status(WORKER_DIAGNOSTIC_USER_ID)
        : await sessions.command(input.data.userId, input.data.command);
      logCommand("worker.command.completed", {
        command: input.data.command.type,
        durationMs: Date.now() - startedAt,
        requestId: c.get("requestId"),
        sessionRef: sessionRef(input.data.userId),
      });
      return c.json({ data });
    } catch (error) {
      const safe = safeError(error);
      workerLog.failure("worker.command.failed", error, {
        stage: "worker",
        httpStatus: safe.status,
        responseCode: safe.code,
        command: input.data.command.type,
        durationMs: Date.now() - startedAt,
        requestId: c.get("requestId"),
        sessionRef: sessionRef(input.data.userId),
      });
      return c.json(
        {
          error: {
            code: safe.code,
            reasonCode: safe.code,
            messageKey: safe.code,
            requestId: c.get("requestId"),
            message: safe.message,
            retryAt: safe.retryAt,
          },
        },
        safe.status as 400 | 403 | 404 | 409 | 429 | 503,
      );
    }
  });
  app.post("/internal/operation", async (c) => {
    const parsed = z
      .object({
        userId: z.string().min(1).max(100),
        input: telegramCommandInputSchema,
        deadline: z.number().int().positive(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: "اطلاعات ارسالی را بررسی کنید.",
          },
        },
        400,
      );
    if (!operations)
      return c.json(
        { error: { code: "UNAVAILABLE", message: "سرویس در دسترس نیست." } },
        503,
      );
    try {
      const data = await operations.accept(
        parsed.data.userId,
        parsed.data.input,
        c.get("requestId"),
        Math.min(parsed.data.deadline, Date.now() + 5000),
      );
      return c.json({ data }, 202);
    } catch (error) {
      const safe = safeError(error);
      workerLog.failure("worker.operation.rejected", error, {
        requestId: c.get("requestId"),
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
  app.onError((error, c) => {
    workerLog.failure("worker.http.unhandled", error, {
      method: c.req.method,
      path: c.req.path,
      status: 503,
    });
    return c.json(
      {
        error: { code: "UNAVAILABLE", message: "سرویس موقتاً در دسترس نیست." },
      },
      503,
    );
  });
  return app;
}
