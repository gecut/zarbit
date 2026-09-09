import { serve } from "@hono/node-server";
import { prisma } from "@zarbit/db";
import { env } from "@zarbit/env/server";
import type { Hono } from "hono";

import type { AppEnv } from "./app-types";
import { createTelegramBot } from "./telegram";
import { serverLog } from "./logger";
import { checkWorkerAtStartup } from "./telegram-session";

export function startApplicationServer(app: Hono<AppEnv>) {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new Error("TELEGRAM_BOT_TOKEN is required.");

  serverLog.info(
    {
      event: "server.starting",
      logLevel: env.LOG_LEVEL,
      releaseId: process.env.RELEASE_ID ?? null,
    },
    "server.starting",
  );

  const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, env.WEB_APP_URL);

  void bot
    .start()
    .catch((error) =>
      serverLog.error(
        { event: "telegram.bot.failed", err: error },
        "telegram.bot.failed",
      ),
    );

  const server = serve({ fetch: app.fetch, port: 3000 });
  void checkWorkerAtStartup().then((health) => {
    if (!stopping)
      serverLog.info(
        { event: "server.ready", port: 3000, ...health },
        "server.ready",
      );
  });
  let stopping = false;

  const stop = async () => {
    if (stopping) return;

    stopping = true;
    serverLog.info({ event: "server.stopping" }, "server.stopping");

    if (bot.isRunning()) await bot.stop();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  };

  process.once("SIGTERM", () => {
    void stop();
  });

  process.once("SIGINT", () => {
    void stop();
  });

  return server;
}
