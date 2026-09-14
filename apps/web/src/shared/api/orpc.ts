import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import {
  AppError,
  TELEGRAM_CONTRACT_HEADER,
  TELEGRAM_CONTRACT_VERSION,
} from "@zarbit/contracts";
import { rpcErrorDataSchema, type RpcClient } from "@zarbit/contracts/rpc";
import { marketPolling, fastQuery, slowQuery } from "./query-policy";

export function createRpcClient(
  url: string,
  initData: () => string,
  transport: typeof fetch = fetch,
): RpcClient {
  const link = new RPCLink({
    url,
    headers: () => ({
      "X-Telegram-Init-Data": initData(),
      [TELEGRAM_CONTRACT_HEADER]: String(TELEGRAM_CONTRACT_VERSION),
    }),
    plugins: [
      new BatchLinkPlugin({
        groups: [
          {
            condition: ({ path }) =>
              ["market.snapshot", "requests.active"].includes(path.join(".")),
            context: {},
          },
        ],
        maxSize: 4,
      }),
    ],
    fetch: (request, init) =>
      transport(request, {
        ...init,
        cache: "no-store",
        signal: new URL(request.url).pathname.endsWith("/market/live")
          ? request.signal
          : AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      }),
    interceptors: [
      async ({ next }) => {
        try {
          return await next();
        } catch (error) {
          if (error instanceof ORPCError) {
            const parsed = rpcErrorDataSchema.safeParse(error.data);
            throw new AppError(
              parsed.success ? parsed.data.appCode : error.code,
              parsed.success
                ? error.message
                : "پاسخ سرویس معتبر نیست؛ دوباره تلاش کنید.",
              error.status,
              parsed.success ? parsed.data.retryAt : undefined,
              parsed.success
                ? { field: parsed.data.field, requestId: parsed.data.requestId }
                : undefined,
            );
          }
          if (error instanceof Error && error.name === "AbortError")
            throw error;
          throw new AppError(
            "NETWORK",
            "ارتباط برقرار نشد؛ وضعیت را تازه کنید.",
            503,
          );
        }
      },
    ],
  });
  return createORPCClient(link);
}

export function createRpcUtils(
  client: RpcClient,
  scope: string,
  marketScope = scope,
) {
  const utils = createTanstackQueryUtils(client, {
    path: ["zarbit", scope],
    experimental_defaults: {
      auth: {
        identity: { queryOptions: { ...slowQuery, meta: { authGate: true } } },
      },
      analytics: {
        traders: { queryOptions: slowQuery },
        traderDetail: { queryOptions: slowQuery },
      },
      telegram: {
        status: { queryOptions: fastQuery },
        command: { mutationOptions: { retry: false, gcTime: 0 } },
      },
      requests: {
        active: { queryOptions: fastQuery },
        detail: { queryOptions: fastQuery },
        history: {
          infiniteOptions: { ...slowQuery, maxPages: 10 },
          queryOptions: slowQuery,
        },
      },
    },
  });
  const market = createTanstackQueryUtils(client.market, {
    path: ["zarbit", marketScope, "market"],
    experimental_defaults: {
      snapshot: {
        queryOptions: {
          ...marketPolling,
        },
      },
    },
  });
  return {
    auth: utils.auth,
    telegram: utils.telegram,
    requests: utils.requests,
    analytics: utils.analytics,
    market,
  };
}
export type RpcUtils = ReturnType<typeof createRpcUtils>;
