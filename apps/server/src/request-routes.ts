import { AppError, requestInputSchema } from "@zarbit/contracts";
import type { Context, Hono } from "hono";
import { z } from "zod";

import type { AppDependencies, AppEnv } from "./app-types";
import { requestDto } from "./request-dto";

const requestListQuerySchema = z.object({
  status: z
    .enum(["ACTIVE", "DONE", "FAILED", "CANCELLED", "HISTORY"])
    .optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});

type RequestWriteOperation = "create" | "edit";

async function writeRequest(
  c: Context<AppEnv>,
  deps: AppDependencies,
  operation: RequestWriteOperation,
) {
  const parsed = requestInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );

  if (!parsed.success)
    throw new AppError(
      "INVALID_REQUEST",
      parsed.error.issues.find((issue) => /[\u0600-\u06ff]/.test(issue.message))
        ?.message ?? "قیمت، تعداد و اطلاعات درخواست را بررسی کنید.",
      400,
    );

  const user = c.get("user");
  const session = await deps.command(user.id, { type: "membership" });

  if (!session.canManageRequests)
    throw new AppError(
      "SESSION_NOT_READY",
      session.error ?? "اتصال تلگرام هنوز آماده نیست.",
    );

  const request =
    operation === "create"
      ? await deps.store.create(user.id, parsed.data)
      : await editRequest(c, deps, user.id, parsed.data);

  if (!request)
    throw new AppError(
      "REQUEST_LOCKED",
      "درخواست اجرا شده یا در حال اجراست؛ قابل ویرایش نیست.",
    );

  return c.json(
    { data: requestDto(request) },
    operation === "create" ? 201 : 200,
  );
}

async function editRequest(
  c: Context<AppEnv>,
  deps: AppDependencies,
  userId: string,
  input: z.infer<typeof requestInputSchema>,
) {
  const requestId = c.req.param("id");

  if (!requestId) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);

  return deps.store.edit(userId, requestId, input);
}

export function registerRequestRoutes(
  app: Hono<AppEnv>,
  deps: AppDependencies,
) {
  app.get("/api/requests", async (c) => {
    const parsed = requestListQuerySchema.safeParse(c.req.query());

    if (!parsed.success)
      throw new AppError("INVALID_QUERY", "فیلتر درخواست نامعتبر است.", 400);

    const result = await deps.store.list(
      c.get("user").id,
      parsed.data.status,
      parsed.data.page,
    );

    return c.json({
      data: { ...result, items: result.items.map(requestDto) },
    });
  });

  app.get("/api/requests/:id", async (c) => {
    const request = await deps.store.request(
      c.get("user").id,
      c.req.param("id"),
    );

    if (!request) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);

    return c.json({ data: requestDto(request) });
  });

  app.post("/api/requests", (c) => writeRequest(c, deps, "create"));
  app.patch("/api/requests/:id", (c) => writeRequest(c, deps, "edit"));

  app.delete("/api/requests/:id", async (c) => {
    if (!(await deps.store.cancel(c.get("user").id, c.req.param("id"))))
      throw new AppError(
        "REQUEST_LOCKED",
        "فقط درخواست اجرا‌نشده قابل لغو است.",
      );

    return c.json({ data: { cancelled: true } });
  });
}
