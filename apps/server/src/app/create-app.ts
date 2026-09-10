import { Hono } from "hono";
import type { AppDependencies } from "../app-dependencies";
import type { AppEnv } from "../transport/http/app-env";
import { generateOpenApi } from "../transport/http/generate-open-api";
import { registerApiErrorHandlers } from "../transport/http/register-api-error-handlers";
import { registerApiMiddleware } from "../transport/http/register-api-middleware";
import { createOrpcRouter } from "../transport/rpc/create-orpc-router";
import { registerRpcRoutes } from "../transport/rpc/register-rpc-routes";

export function createApp(deps: AppDependencies) {
  const app = new Hono<AppEnv>();

  registerApiMiddleware(app, deps);

  const router = createOrpcRouter(deps);
  registerRpcRoutes(app, router);

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

  registerApiErrorHandlers(app);

  return app;
}
