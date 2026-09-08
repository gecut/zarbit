import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { generateOpenApi } from "./openapi";
import { BodyLimitPlugin, CompressionPlugin } from "@orpc/server/fetch";
import {
  BatchHandlerPlugin,
  ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import { registerRequestRoutes } from "./request-routes";
import { Hono } from "hono";

import { registerApiErrorHandlers } from "./api-error-handlers";
import { registerApiMiddleware } from "./api-middleware";
import type { AppDependencies, AppEnv } from "./app-types";
import { registerQuoteRoutes } from "./quote-routes";
import { registerTelegramSessionRoutes } from "./telegram-session-routes";
import { RPCHandler } from "@orpc/server/fetch";
import { createOrpcRouter, rpcError } from "./orpc-router";

export function createApp(deps: AppDependencies) {
  const app = new Hono<AppEnv>();

  registerApiMiddleware(app, deps);

  const router = createOrpcRouter(deps);
  const rpc = new RPCHandler(router, {
    plugins: [
      new CompressionPlugin(),
      new BodyLimitPlugin({ maxBodySize: 16_384 }),
      new BatchHandlerPlugin({ maxSize: 4 }),
      new ResponseHeadersPlugin(),
    ],
    interceptors: [
      async ({ next }) => {
        try {
          return await next();
        } catch (error) {
          throw rpcError(error);
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
  let spec: ReturnType<typeof generateOpenApi> | undefined;
  app.get("/api/openapi.json", async (c) => {
    spec ??= generateOpenApi().catch((error: unknown) => {
      spec = undefined;
      throw error;
    });
    return c.json(await spec);
  });

  app.get("/", async (c) => {
    await deps.store.db.$queryRaw`SELECT 1`;
    return c.text("OK");
  });

  app.post("/api/auth/telegram", (c) => {
    const { id: _, ...identity } = c.get("user");
    return c.json({ data: identity });
  });

  registerQuoteRoutes(app, deps);
  registerRequestRoutes(app, deps);
  registerTelegramSessionRoutes(app, deps);
  registerApiErrorHandlers(app);

  return app;
}
