import { implement, ORPCError } from "@orpc/server";
import {
  AppError,
  type QuoteDashboard,
  type RequestDetail,
  type TelegramSessionStatus,
} from "@zarbit/contracts";
import { rpcContract } from "@zarbit/contracts/rpc";
import { requestView } from "@zarbit/db/requests";
import type { AppDependencies } from "./app-types";
import { ResponseCache } from "./response-cache";
import { ReadCapacity, RpcRateLimit } from "./rpc-capacity";
import { RpcMetrics } from "./rpc-metrics";
import { serverLog } from "./logger";

export function rpcError(error: unknown) {
  if (error instanceof ORPCError) {
    if (error.code === "BAD_REQUEST")
      return new ORPCError("BAD_REQUEST", {
        message: "اطلاعات ارسالی را بررسی کنید.",
        data: { appCode: "INVALID_INPUT" },
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
      retryAt: safe.retryAt,
      retryAfter: safe.retryAt
        ? Math.max(0, Math.ceil((Date.parse(safe.retryAt) - Date.now()) / 1000))
        : undefined,
    },
  });
}

export function createOrpcRouter(deps: AppDependencies) {
  const metrics = new RpcMetrics((snapshot) =>
    serverLog.info({ event: "rpc.metrics", ...snapshot }, "rpc.metrics"),
  );
  const capacity = new ReadCapacity();
  const workerCapacity = new ReadCapacity(4, 3000);
  const limiter = new RpcRateLimit();
  const observe = (name: string) => (event: string) =>
    metrics.cacheEvent(name, event);
  const users = new ResponseCache<Awaited<ReturnType<typeof deps.store.user>>>({
    ttlMs: 300_000,
    maxEntries: 100,
    observe: observe("identity"),
  });
  const quotes = new ResponseCache<QuoteDashboard>({
    ttlMs: 1000,
    staleMs: 1000,
    maxEntries: 1,
    observe: observe("quote"),
  });
  const active = new ResponseCache<RequestDetail[]>({
    ttlMs: 1000,
    maxEntries: 100,
    observe: observe("requests"),
  });
  const sessions = new ResponseCache<TelegramSessionStatus>({
    ttlMs: 1000,
    maxEntries: 100,
    observe: observe("session"),
  });
  const read = <T>(name: string, load: () => Promise<T>) =>
    capacity.run(() => metrics.measure(`db.${name}`, load));
  const dashboard = () =>
    quotes.get("global", () =>
      read("quote", async () => {
        const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const [latest, points] = await Promise.all([
          deps.store.latestQuote(),
          deps.store.quotesSince(since),
        ]);
        return {
          latest: latest
            ? {
                quote: latest.compactQuote,
                announcedAt: latest.announcedAt.toISOString(),
              }
            : null,
          points: points.map((p) => ({
            quote: p.compactQuote,
            announcedAt: p.announcedAt.toISOString(),
          })),
        };
      }),
    );
  const requireSession = async (id: string) => {
    const status = await deps.command(id, { type: "status" });
    if (status.state !== "ACTIVE" || status.connection !== "CONNECTED")
      throw new AppError(
        "SESSION_REQUIRED",
        "ابتدا اتصال تلگرام را برقرار کنید.",
      );
  };
  const changeRequest = async <T>(id: string, action: () => Promise<T>) => {
    active.invalidate(id);
    try {
      return await action();
    } finally {
      active.invalidate(id);
    }
  };
  const os = implement(rpcContract)
    .$context<{ headers: Headers; requestId: string; resHeaders?: Headers }>()
    .use(async ({ context, next, path }) => {
      return metrics.measure(`rpc.${path.join(".")}`, async () => {
        try {
          let identity;
          try {
            identity = deps.authenticate(
              context.headers.get("X-Telegram-Init-Data") ?? undefined,
            );
          } catch {
            throw new AppError(
              "UNAUTHORIZED",
              "ورود معتبر نیست؛ برنامه را از تلگرام دوباره باز کنید.",
              401,
            );
          }
          const mutation = [
            "create",
            "update",
            "cancel",
            "forceSend",
            "command",
          ].includes(path.at(-1) ?? "");
          limiter.consume(identity.telegramUserId, mutation);
          const user = await users.get(JSON.stringify(identity), () =>
            read("identity", () => deps.store.user(identity)),
          );
          return await next({
            context: { user: { id: user.id, ...identity } },
          });
        } catch (error) {
          if (error instanceof AppError && error.retryAt) {
            context.resHeaders?.set(
              "Retry-After",
              String(
                Math.max(
                  1,
                  Math.ceil((Date.parse(error.retryAt) - Date.now()) / 1000),
                ),
              ),
            );
          }
          serverLog.debug(
            {
              event: "rpc.failed",
              requestId: context.requestId,
              procedure: path.join("."),
              errorCode:
                error instanceof AppError || error instanceof ORPCError
                  ? error.code
                  : "UNAVAILABLE",
            },
            "rpc.failed",
          );
          throw rpcError(error);
        }
      });
    });
  return os.router({
    auth: {
      identity: os.auth.identity.handler(({ context }) => {
        const { id: _, ...identity } = context.user;
        return identity;
      }),
    },
    quote: {
      dashboard: os.quote.dashboard.handler(dashboard),
      latest: os.quote.latest.handler(async () => (await dashboard()).latest),
    },
    telegram: {
      status: os.telegram.status.handler(({ context }) =>
        sessions.get(context.user.id, () =>
          workerCapacity.run(() =>
            deps.command(context.user.id, { type: "status" }),
          ),
        ),
      ),
      command: os.telegram.command.handler(async ({ context, input }) => {
        const id = context.user.id;
        sessions.invalidate(id);
        active.invalidate(id);
        try {
          if (input.type === "revoke")
            await deps.store.disableSession(
              id,
              "REVOKING",
              "قطع اتصال درخواست شده؛ وضعیت درخواست‌های خود را بررسی کنید.",
            );
          return await deps.command(id, input);
        } finally {
          sessions.invalidate(id);
          active.invalidate(id);
        }
      }),
    },
    requests: {
      active: os.requests.active.handler(({ context }) =>
        active.get(context.user.id, () =>
          read("active", async () =>
            (await deps.store.activeRequests(context.user.id)).map(requestView),
          ),
        ),
      ),
      history: os.requests.history.handler(({ context, input }) =>
        read("history", () =>
          deps.store.requestHistory(context.user.id, input.cursor),
        ),
      ),
      detail: os.requests.detail.handler(async ({ context, input }) => {
        const row = await read("detail", () =>
          deps.store.request(context.user.id, input.id),
        );
        if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
        return requestView(row);
      }),
      create: os.requests.create.handler(({ context, input }) =>
        changeRequest(context.user.id, async () => {
          await requireSession(context.user.id);
          return requestView(
            await deps.store.createRequest(context.user.id, input),
          );
        }),
      ),
      update: os.requests.update.handler(({ context, input }) =>
        changeRequest(context.user.id, async () => {
          await requireSession(context.user.id);
          return requestView(
            await deps.store.editRequest(context.user.id, input.id, input.data),
          );
        }),
      ),
      cancel: os.requests.cancel.handler(({ context, input }) =>
        changeRequest(context.user.id, async () =>
          requestView(
            await deps.store.cancelRequest(context.user.id, input.id),
          ),
        ),
      ),
      forceSend: os.requests.forceSend.handler(({ context, input }) =>
        changeRequest(context.user.id, async () => {
          const row = await deps.store.request(context.user.id, input.id);
          if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
          await requireSession(context.user.id);
          await deps.command(context.user.id, {
            type: "force-send",
            id: input.id,
          });
          return requestView(
            (await deps.store.request(context.user.id, input.id)) ?? row,
          );
        }),
      ),
    },
  });
}
