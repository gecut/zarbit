import { serve } from "@hono/node-server";
import {
  RequestStatus,
  cancelActiveRequest,
  createRequest,
  getRequestForUser,
  listRequestsForUser,
  updateActiveRequest,
  upsertTelegramUser,
  type RequestInput,
} from "@zarbit/db";
import { compactQuoteToHumanPrice, humanPriceToCompactQuote } from "@zarbit/domain";
import { env } from "@zarbit/env/server";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import { authenticateTelegramRequest } from "./auth.js";
import { createTelegramBot } from "./telegram.js";
import {
  createTelegramQrChallenge,
  getTelegramSessionStatus,
  revokeTelegramSession,
  userCanManageRequests,
} from "./telegram-session.js";

const requestInputSchema = z.object({
  condition: z.enum(["LTE", "GTE"]),
  targetPrice: z.number().int().positive(),
  action: z.enum(["ALERT", "BUY", "SELL"]),
  units: z.number().int().positive().nullable().optional(),
}).superRefine((value, context) => {
  if (value.action !== "ALERT" && !value.units) {
    context.addIssue({ code: "custom", message: "تعداد واحد برای خرید و فروش الزامی است.", path: ["units"] });
  }
});

function requestDto(request: {
  id: string;
  condition: "LTE" | "GTE";
  targetPrice: number;
  action: "ALERT" | "BUY" | "SELL";
  units: number | null;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  triggeredQuote: number | null;
  completedAt: Date | null;
  failureReason: string | null;
  cancellationReason: string | null;
}) {
  return {
    id: request.id,
    condition: request.condition,
    targetPrice: compactQuoteToHumanPrice(request.targetPrice),
    action: request.action,
    units: request.units,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    triggeredQuote: request.triggeredQuote ? compactQuoteToHumanPrice(request.triggeredQuote) : null,
    completedAt: request.completedAt,
    failureReason: request.failureReason,
    cancellationReason: request.cancellationReason,
  };
}

function errorResponse(message: string, status = 400) {
  return { error: { message, status } };
}

type AppEnv = { Variables: { user: { id: string; telegramUserId: string } } };

export const app = new Hono<AppEnv>();

app.use(logger());
app.use("/*", cors({
  origin: env.CORS_ORIGIN,
  allowHeaders: ["Content-Type", "X-Telegram-Init-Data"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));
app.get("/", (c) => c.text("OK"));

async function currentUser(initData: string | undefined) {
  const identity = authenticateTelegramRequest(initData);
  const user = await upsertTelegramUser(identity);
  return { id: user.id, telegramUserId: user.telegramUserId };
}

app.post("/api/auth/telegram", async (c) => {
  let initData: string | undefined;
  try {
    const body = await c.req.json<{ initData?: unknown }>();
    initData = typeof body.initData === "string" ? body.initData : undefined;
    authenticateTelegramRequest(initData);
  } catch (error) {
    return c.json(errorResponse(error instanceof Error ? error.message : "ورود ناموفق بود.", 401), 401);
  }
  try {
    const user = await currentUser(initData);
    return c.json({ data: { telegramUserId: user.telegramUserId } });
  } catch {
    return c.json(errorResponse("سرویس موقتاً در دسترس نیست.", 503), 503);
  }
});

const apiAuthentication: MiddlewareHandler<AppEnv> = async (c, next) => {
  let identity;
  try {
    identity = authenticateTelegramRequest(c.req.header("X-Telegram-Init-Data"));
  } catch (error) {
    return c.json(errorResponse(error instanceof Error ? error.message : "دسترسی نامعتبر است.", 401), 401);
  }
  try {
    const user = await upsertTelegramUser(identity);
    c.set("user", { id: user.id, telegramUserId: user.telegramUserId });
  } catch {
    return c.json(errorResponse("سرویس موقتاً در دسترس نیست.", 503), 503);
  }
  await next();
};

app.use("/api/requests/*", apiAuthentication);
app.use("/api/telegram-session/*", apiAuthentication);

async function requireActiveTelegramSession(userId: string): Promise<void> {
  if (!await userCanManageRequests(userId)) {
    throw new Error("برای ثبت یا ویرایش درخواست، اتصال تلگرام و عضویت گروه باید فعال باشد.");
  }
}

app.get("/api/requests", async (c) => {
  const filter = c.req.query("status");
  const status = filter && Object.values(RequestStatus).includes(filter as RequestStatus) ? filter as RequestStatus : undefined;
  const requests = await listRequestsForUser(c.get("user").id, status);
  return c.json({ data: requests.map(requestDto) });
});

app.get("/api/requests/:id", async (c) => {
  const request = await getRequestForUser(c.get("user").id, c.req.param("id"));
  return request ? c.json({ data: requestDto(request) }) : c.json(errorResponse("درخواست پیدا نشد.", 404), 404);
});

async function parseRequestInput(body: unknown): Promise<{ data: RequestInput } | { error: string }> {
  const parsed = requestInputSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "اطلاعات درخواست نامعتبر است." };
  try {
    return { data: {
      ...parsed.data,
      units: parsed.data.action === "ALERT" ? null : parsed.data.units ?? null,
      targetPrice: humanPriceToCompactQuote(parsed.data.targetPrice),
    } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "قیمت نامعتبر است." };
  }
}

app.post("/api/requests", async (c) => {
  const input = await parseRequestInput(await c.req.json());
  if ("error" in input) return c.json(errorResponse(input.error), 400);
  try {
    await requireActiveTelegramSession(c.get("user").id);
  } catch (error) {
    return c.json(errorResponse(error instanceof Error ? error.message : "اتصال تلگرام فعال نیست.", 409), 409);
  }
  const request = await createRequest(c.get("user").id, input.data);
  return c.json({ data: requestDto(request) }, 201);
});

app.patch("/api/requests/:id", async (c) => {
  const input = await parseRequestInput(await c.req.json());
  if ("error" in input) return c.json(errorResponse(input.error), 400);
  try {
    await requireActiveTelegramSession(c.get("user").id);
  } catch (error) {
    return c.json(errorResponse(error instanceof Error ? error.message : "اتصال تلگرام فعال نیست.", 409), 409);
  }
  const request = await updateActiveRequest(c.get("user").id, c.req.param("id"), input.data);
  return request ? c.json({ data: requestDto(request) }) : c.json(errorResponse("فقط درخواست فعال و اجرا نشده قابل ویرایش است.", 409), 409);
});

app.delete("/api/requests/:id", async (c) => {
  const request = await cancelActiveRequest(c.get("user").id, c.req.param("id"));
  return request ? c.json({ data: requestDto(request) }) : c.json(errorResponse("فقط درخواست فعال و اجرا نشده قابل لغو است.", 409), 409);
});

app.get("/api/telegram-session/status", async (c) => {
  return c.json({ data: await getTelegramSessionStatus(c.get("user").id) });
});

app.post("/api/telegram-session/qr", async (c) => {
  try {
    const user = c.get("user");
    return c.json({ data: await createTelegramQrChallenge({ userId: user.id, telegramUserId: user.telegramUserId }) }, 201);
  } catch (error) {
    return c.json(errorResponse(error instanceof Error ? error.message : "ایجاد QR ناموفق بود.", 409), 409);
  }
});

app.delete("/api/telegram-session", apiAuthentication, async (c) => {
  return c.json({ data: await revokeTelegramSession(c.get("user").id) });
});

export function startServer() {
  if (env.TELEGRAM_BOT_TOKEN) {
    const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, env.WEB_APP_URL);
    bot.start({ drop_pending_updates: false }).catch((error: unknown) => {
      console.error("Telegram bot failed to start", error instanceof Error ? error.message : error);
    });
  }
  return serve({ fetch: app.fetch, port: 3000 }, (info) => console.info(`Server is running on http://localhost:${info.port}`));
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
