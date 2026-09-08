import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { AppError } from "@zarbit/contracts";
import { rpcErrorDataSchema, type RpcClient } from "@zarbit/contracts/rpc";
import { fastQuery, slowQuery } from "./query-policy";

export function createRpcClient(
  url: string,
  initData: () => string,
  transport: typeof fetch = fetch,
): RpcClient {
  const link = new RPCLink({
    url,
    headers: () => ({ "X-Telegram-Init-Data": initData() }),
    plugins: [
      new BatchLinkPlugin({
        groups: [
          {
            condition: ({ path }) =>
              !["command", "create", "update", "cancel", "forceSend"].includes(
                path.at(-1) ?? "",
              ),
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
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
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

export function createRpcUtils(client: RpcClient, scope: string) {
  return createTanstackQueryUtils(client, {
    path: ["zarbit", scope],
    experimental_defaults: {
      auth: {
        identity: { queryOptions: { ...slowQuery, meta: { authGate: true } } },
      },
      quote: {
        dashboard: { queryOptions: fastQuery },
        latest: { queryOptions: fastQuery },
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
}
export type RpcUtils = ReturnType<typeof createRpcUtils>;
