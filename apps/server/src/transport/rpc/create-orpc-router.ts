import { implement, ORPCError } from "@orpc/server";
import {
  AppError,
  TELEGRAM_CONTRACT_HEADER,
  TELEGRAM_CONTRACT_VERSION,
  type RequestDetail,
  telegramSessionStatusSchema,
} from "@zarbit/contracts";
import { rpcContract } from "@zarbit/contracts/rpc";
import type { AppDependencies } from "../../app-dependencies";
import { createAuthRouter } from "../../modules/auth/create-auth-router";
import { createMarketRouter } from "../../modules/market/create-market-router";
import { createRequestsRouter } from "../../modules/requests/create-requests-router";
import { createTelegramRouter } from "../../modules/telegram/create-telegram-router";
import { createAnalyticsRouter } from "../../modules/analytics/create-analytics-router";
import { AnalyticsService } from "../../modules/analytics/analytics-service";
import type { ParticipantAnalyticsSummary } from "@zarbit/contracts";
import { ResponseCache } from "../../platform/cache/response-cache";
import { serverLog } from "../../platform/observability/server-log";
import { RpcMetrics } from "../../platform/observability/rpc-metrics";
import { ReadCapacity } from "../../platform/resilience/read-capacity";
import { RpcRateLimit } from "../../platform/resilience/rpc-rate-limit";
import { rpcError } from "./rpc-error";
import {
  createMarketRuntime,
  type MarketRuntime,
} from "../../modules/market/create-market-runtime";

export function createOrpcRouter(
  deps: AppDependencies,
  runtime: MarketRuntime = createMarketRuntime(deps.store),
) {
  const metrics = new RpcMetrics((snapshot) =>
    serverLog.info({ event: "rpc.metrics", ...snapshot }, "rpc.metrics"),
  );
  const workerCapacity = new ReadCapacity(4, 3000);
  const limiter = new RpcRateLimit();
  const observe = (name: string) => (event: string) =>
    metrics.cacheEvent(name, event);

  const users = new ResponseCache<Awaited<ReturnType<typeof deps.store.user>>>({
    ttlMs: 300_000,
    maxEntries: 100,
    observe: observe("identity"),
  });

  const active = new ResponseCache<RequestDetail[]>({
    ttlMs: 1000,
    maxEntries: 100,
    observe: observe("requests"),
  });
  const sessions = new ResponseCache<
    ReturnType<typeof telegramSessionStatusSchema.parse>
  >({
    ttlMs: 1000,
    maxEntries: 100,
    observe: observe("session"),
  });
  const traders = new ResponseCache<ParticipantAnalyticsSummary[]>({
    ttlMs: 5000,
    staleMs: 5000,
    maxEntries: 10,
    observe: observe("analytics.traders"),
  });
  const analyticsService = new AnalyticsService(deps.store);

  const read = <T>(name: string, load: () => Promise<T>) =>
    runtime.read(name, () => metrics.measure(`db.${name}`, load));

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
          } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(
              "UNAUTHORIZED",
              "ورود معتبر نیست؛ برنامه را از تلگرام دوباره باز کنید.",
              401,
            );
          }
          if (
            path[0] === "telegram" &&
            context.headers.get(TELEGRAM_CONTRACT_HEADER) !==
              String(TELEGRAM_CONTRACT_VERSION)
          )
            throw new AppError(
              "CLIENT_UPDATE_REQUIRED",
              "نسخه برنامه قدیمی است؛ برنامه را به‌روز کنید.",
              409,
            );
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
          serverLog.warn(
            {
              event: "rpc.failed",
              requestId: context.requestId,
              procedure: path.join("."),
              errorCode:
                error instanceof AppError || error instanceof ORPCError
                  ? error.code
                  : "UNAVAILABLE",
              reasonCode:
                error instanceof AppError ? error.code : "UNAVAILABLE",
            },
            "rpc.failed",
          );
          throw rpcError(error, context.requestId);
        }
      });
    });

  const market = createMarketRouter(os.market, {
    state: runtime.state,
  });

  return os.router({
    auth: createAuthRouter(os.auth),
    market,
    telegram: createTelegramRouter(os.telegram, {
      store: deps.store,
      command: deps.command,
      acceptCommand: deps.acceptCommand,
      sessions,
      active,
      workerCapacity,
    }),
    requests: createRequestsRouter(os.requests, {
      store: deps.store,
      command: deps.command,
      active,
      read,
    }),
    analytics: createAnalyticsRouter(os.analytics, {
      store: deps.store,
      service: analyticsService,
      tradersCache: traders,
      read,
    }),
  });
}
