import { serve } from "@hono/node-server";
import { prisma } from "@zarbit/db";
import { env } from "@zarbit/env/server";
import type { Hono } from "hono";
import type { AppEnv } from "../transport/http/app-env";
import { createTelegramBot } from "../integrations/telegram-bot/create-telegram-bot";
import { probeWorker } from "../integrations/worker/probe-worker";
import { serverLog } from "../platform/observability/server-log";
import { assertTelegramBotConfiguration } from "./telegram-bot-config";

export function startApplicationServer(
  app: Hono<AppEnv>,
  stopMarket: () => Promise<void> = async () => undefined,
) {
  assertTelegramBotConfiguration(env.NODE_ENV, env.TELEGRAM_BOT_TOKEN);

  serverLog.info(
    {
      event: "server.starting",
      logLevel: env.LOG_LEVEL,
      releaseId: process.env.RELEASE_ID ?? null,
    },
    "server.starting",
  );

  const bot = env.TELEGRAM_BOT_TOKEN
    ? createTelegramBot(env.TELEGRAM_BOT_TOKEN, env.WEB_APP_URL)
    : undefined;

  if (bot) {
    void bot
      .start()
      .catch((error) =>
        serverLog.error(
          { event: "telegram.bot.failed", err: error },
          "telegram.bot.failed",
        ),
      );
  } else {
    serverLog.warn(
      { event: "telegram.bot.disabled", environment: env.NODE_ENV },
      "telegram.bot.disabled",
    );
  }

  const server = serve({ fetch: app.fetch, port: 3000 });

  const transport = {
    fetch: globalThis.fetch,
    workerInternalToken: env.WORKER_INTERNAL_TOKEN,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
  };

  void probeWorker(transport, (event, details) => {
    serverLog[event.endsWith("failed") ? "error" : "info"](
      { event, ...details },
      event,
    );
  }).then((health) => {
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

    await stopMarket();
    if (bot?.isRunning()) await bot.stop();

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
