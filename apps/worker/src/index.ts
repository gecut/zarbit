import { serve } from "@hono/node-server";
import {
  checkDatabaseHealth,
  databasePoolStats,
  store,
  prisma,
} from "@zarbit/db";
import { env, allowedTelegramUserIds } from "@zarbit/env/worker";
import { Bot } from "grammy";
import { Sessions } from "./sessions";
import { SessionFiles } from "./session-files";
import { mtcuteFactory } from "./mtcute";
import { createWorkerApp } from "./http";
import { createQuoteRecorder } from "./quote";
import { acquireWorkerOwnership } from "./ownership";
import { workerLog } from "./logger";

export async function startWorker() {
  const missing = Object.entries({
    TELEGRAM_API_ID: env.TELEGRAM_API_ID,
    TELEGRAM_API_HASH: env.TELEGRAM_API_HASH,
    TELEGRAM_GROUP_ID: env.TELEGRAM_GROUP_ID,
    QUOTE_SENDER_ID: env.QUOTE_SENDER_ID,
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    WORKER_INTERNAL_TOKEN: env.WORKER_INTERNAL_TOKEN,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length)
    throw new Error(
      `Worker configuration is incomplete: ${missing.join(", ")}`,
    );
  workerLog.info("worker.starting", {
    allowlistSize: allowedTelegramUserIds.size,
    logLevel: env.LOG_LEVEL,
    maxTelegramSessions: env.MAX_TELEGRAM_SESSIONS,
  });
  process.umask(0o077);
  const files = new SessionFiles(env.TELEGRAM_SESSIONS_DIR);
  await files.prepare();
  const releaseOwnership = await acquireWorkerOwnership(
    env.TELEGRAM_SESSIONS_DIR,
  );
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN!, {
    client: { timeoutSeconds: 10 },
  });
  const notify = async (id: string, text: string) => {
    await bot.api.sendMessage(id, text);
  };
  const sessions = new Sessions(store, {
    max: env.MAX_TELEGRAM_SESSIONS,
    secret: env.WORKER_INTERNAL_TOKEN!,
    allowlist: allowedTelegramUserIds,
    files,
    factory: mtcuteFactory({
      apiId: env.TELEGRAM_API_ID!,
      apiHash: env.TELEGRAM_API_HASH!,
      groupId: env.TELEGRAM_GROUP_ID!,
    }),
    notify: async (userId, text) => {
      const user = await store.owner(userId);
      if (user) await notify(user.telegramUserId, text);
    },
  });
  const initializeStartedAt = Date.now();
  try {
    await sessions.initialize();
  } catch (error) {
    releaseOwnership();
    throw error;
  }
  workerLog.info("telegram.sessions.initialized", {
    durationMs: Date.now() - initializeStartedAt,
  });
  sessions.onQuote = createQuoteRecorder(store, {
    groupId: env.TELEGRAM_GROUP_ID!,
    senderId: env.QUOTE_SENDER_ID!,
  });
  const server = serve({
    fetch: createWorkerApp(
      sessions,
      env.WORKER_INTERNAL_TOKEN!,
      checkDatabaseHealth,
    ).fetch,
    port: 3002,
  });
  workerLog.info("worker.ready", { internalPort: 3002 });
  const sync = async () => {
    const startedAt = Date.now();
    try {
      const result = await sessions.synchronize();
      if (result.failures)
        workerLog.warn("telegram.sessions.sync_completed", {
          durationMs: Date.now() - startedAt,
          failures: result.failures,
          recoveryAttempts: result.recoveryAttempts,
          revocations: result.revocations,
          scanned: result.scanned,
        });
      else if (result.recoveryAttempts || result.revocations)
        workerLog.info("telegram.sessions.sync_completed", {
          durationMs: Date.now() - startedAt,
          recoveryAttempts: result.recoveryAttempts,
          revocations: result.revocations,
          scanned: result.scanned,
        });
      else
        workerLog.debug("telegram.sessions.sync_completed", {
          durationMs: Date.now() - startedAt,
          scanned: result.scanned,
        });
    } catch (error) {
      workerLog.failure("telegram.sessions.sync_failed", error, {
        durationMs: Date.now() - startedAt,
        phase: "load_sessions",
        ...databasePoolStats(),
      });
    }
  };
  const timer = setInterval(() => {
    void sync();
  }, 5000);
  void sync();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    workerLog.info("worker.stopping");
    clearInterval(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await sessions.stop();
    await prisma.$disconnect();
    releaseOwnership();
    workerLog.info("worker.stopped");
  };
  process.once("SIGTERM", () => {
    void stop().catch((error) =>
      workerLog.failure("worker.stop_failed", error),
    );
  });
  process.once("SIGINT", () => {
    void stop().catch((error) =>
      workerLog.failure("worker.stop_failed", error),
    );
  });
  return { stop };
}
