import { Hono } from "hono";

import { registerApiErrorHandlers } from "./api-error-handlers";
import { registerApiMiddleware } from "./api-middleware";
import type { AppDependencies, AppEnv } from "./app-types";
import { registerRequestRoutes } from "./request-routes";
import { registerTelegramSessionRoutes } from "./telegram-session-routes";

export function createApp(deps: AppDependencies) {
  const app = new Hono<AppEnv>();

  registerApiMiddleware(app, deps);

  app.get("/", async (c) => {
    await deps.store.db.$queryRaw`SELECT 1`;
    return c.text("OK");
  });

  app.post("/api/auth/telegram", (c) => {
    const { id: _, ...identity } = c.get("user");
    return c.json({ data: identity });
  });

  registerRequestRoutes(app, deps);
  registerTelegramSessionRoutes(app, deps);
  registerApiErrorHandlers(app);

  return app;
}
