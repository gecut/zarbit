import { OpenAPIHandler } from "@orpc/openapi/fetch";
import {
  BodyLimitPlugin,
  CompressionPlugin,
  RPCHandler,
} from "@orpc/server/fetch";
import {
  BatchHandlerPlugin,
  ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import type { Hono } from "hono";
import type { AppEnv } from "../http/app-env";
import type { createOrpcRouter } from "./create-orpc-router";
import { rpcError } from "./rpc-error";

export function registerRpcRoutes(
  app: Hono<AppEnv>,
  router: ReturnType<typeof createOrpcRouter>,
) {
  const rpc = new RPCHandler(router, {
    eventIteratorKeepAliveEnabled: true,
    eventIteratorKeepAliveInterval: 15_000,
    plugins: [
      new CompressionPlugin(),
      new BodyLimitPlugin({ maxBodySize: 16_384 }),
      new BatchHandlerPlugin({ maxSize: 4 }),
      new ResponseHeadersPlugin(),
    ],
    interceptors: [
      async ({ next, context }) => {
        try {
          return await next();
        } catch (error) {
          throw rpcError(error, context.requestId);
        }
      },
    ],
  });

  app.use("/rpc/*", async (c, next) => {
    c.header("Cache-Control", "no-store");

    const result = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: { headers: c.req.raw.headers, requestId: crypto.randomUUID() },
    });

    if (result.matched && result.response)
      return c.newResponse(result.response.body, result.response);

    return next();
  });

  const openapi = new OpenAPIHandler(router, {
    plugins: [
      new BodyLimitPlugin({ maxBodySize: 16_384 }),
      new ResponseHeadersPlugin(),
    ],
  });

  app.use("/openapi/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const result = await openapi.handle(c.req.raw, {
      prefix: "/openapi",
      context: { headers: c.req.raw.headers, requestId: crypto.randomUUID() },
    });
    if (result.matched)
      return c.newResponse(result.response.body, result.response);
    return next();
  });
}
