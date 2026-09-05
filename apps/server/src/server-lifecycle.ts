import { serve } from "@hono/node-server";
import { prisma } from "@zarbit/db";
import { env } from "@zarbit/env/server";
import type { Hono } from "hono";

import type { AppEnv } from "./app-types";
import { createTelegramBot } from "./telegram";

export function startApplicationServer(app: Hono<AppEnv>) {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new Error("TELEGRAM_BOT_TOKEN is required.");

  const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, env.WEB_APP_URL);

  void bot.start().catch(() => console.error("telegram.bot.failed"));

  const server = serve({ fetch: app.fetch, port: 3000 });
  let stopping = false;

  const stop = async () => {
    if (stopping) return;

    stopping = true;

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
