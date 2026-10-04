import {
  AppError,
  createRequestInputSchema,
  updateRequestInputSchema,
} from "@zarbit/contracts";
import { requestView } from "@zarbit/db/requests";
import type { Hono } from "hono";
import type { AppDependencies } from "../../app-dependencies";
import type { AppEnv } from "../../transport/http/app-env";

import type { z } from "zod";

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      "INVALID_INPUT",
      "قیمت، تعداد و نوع درخواست را بررسی کنید.",
      400,
    );
  return result.data;
}

export function registerRequestRoutes(
  app: Hono<AppEnv>,
  deps: AppDependencies,
) {
  const requireSession = async (id: string) => {
    const session = await deps.command(id, { type: "status" });
    if (
      session.authorization !== "AUTHORIZED" ||
      session.connection !== "CONNECTED"
    )
      throw new AppError(
        "SESSION_REQUIRED",
        "ابتدا اتصال تلگرام را برقرار کنید.",
      );
  };
  app.get("/api/requests/active", async (c) =>
    c.json({
      data: (await deps.store.activeRequests(c.get("user").id)).map(
        requestView,
      ),
    }),
  );
  app.get("/api/requests/history", async (c) =>
    c.json({
      data: await deps.store.requestHistory(
        c.get("user").id,
        c.req.query("cursor"),
      ),
    }),
  );
  app.get("/api/requests/:id", async (c) => {
    const row = await deps.store.request(c.get("user").id, c.req.param("id"));
    if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
    return c.json({ data: requestView(row) });
  });
  app.post("/api/requests", async (c) => {
    const input = parseInput(
      createRequestInputSchema,
      await c.req.json().catch(() => null),
    );
    const userId = c.get("user").id;
    const existing = await deps.store.findRequestCreation?.(userId, input);
    if (existing) {
      return c.json({ data: requestView(existing) }, 200);
    }
    await requireSession(userId);
    return c.json(
      { data: requestView(await deps.store.createRequest(userId, input)) },
      201,
    );
  });
  app.patch("/api/requests/:id", async (c) => {
    const input = parseInput(
      updateRequestInputSchema,
      await c.req.json().catch(() => null),
    );
    const userId = c.get("user").id;
    await requireSession(userId);
    return c.json({
      data: requestView(
        await deps.store.editRequest(userId, c.req.param("id"), input),
      ),
    });
  });
  app.post("/api/requests/:id/cancel", async (c) => {
    const userId = c.get("user").id;
    return c.json({
      data: requestView(
        await deps.store.cancelRequest(userId, c.req.param("id")),
      ),
    });
  });
  app.post("/api/requests/:id/force-send", async (c) => {
    const userId = c.get("user").id;
    const id = c.req.param("id");
    const row = await deps.store.request(userId, id);
    if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
    await requireSession(userId);
    await deps.command(userId, { type: "force-send", id });
    return c.json({
      data: requestView((await deps.store.request(userId, id)) ?? row),
    });
  });
}
