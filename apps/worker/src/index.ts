import { createTradeRequestProcessor } from "./trade-request-processor";
import { createTraderRuleProcessor } from "./trader-rule-processor";
import { createRequestExecutor } from "./requests";
import { serve } from "@hono/node-server";
import {
  checkDatabaseHealth,
  databasePoolStats,
  store,
  prisma,
} from "@zarbit/db";
import { SETTLEMENT_PARSER_READY } from "@zarbit/domain";
import { env, allowedTelegramUserIds } from "@zarbit/env/worker";
import { Bot } from "grammy";
import { formatSessionMessage } from "@zarbit/messages";
import {
  createPrivateNotifier,
  notifyRecoveredRequests,
} from "./notifications";
import { Sessions } from "./sessions";
import { SessionOperations } from "./session-operations";
import { SessionFiles } from "./session-files";
import { mtcuteFactory } from "./mtcute";
import { createWorkerApp } from "./http";
import { createMarketIngestion } from "./market-ingestion";
import { createFinancialIngestionCoordinator } from "./financial-ingestion-coordinator";
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
  const notify = createPrivateNotifier(bot, {
    webAppUrl: env.WEB_APP_URL,
    groupId: env.TELEGRAM_GROUP_ID!,
  });
  const sessions = new Sessions(store, {
    groupId: env.TELEGRAM_GROUP_ID!,
    quoteSenderId: env.QUOTE_SENDER_ID!,
    max: env.MAX_TELEGRAM_SESSIONS,
    secret: env.WORKER_INTERNAL_TOKEN!,
    allowlist: allowedTelegramUserIds,
    files,
    factory: mtcuteFactory({
      apiId: env.TELEGRAM_API_ID!,
      apiHash: env.TELEGRAM_API_HASH!,
      groupId: env.TELEGRAM_GROUP_ID!,
    }),
    notify: async (userId, event) => {
      const user = await store.owner(userId);
      if (!user) throw new Error("NOTIFICATION_OWNER_MISSING");
      await notify(user.telegramUserId, formatSessionMessage(event), {
        connection: true,
      });
    },
  });
  if (
    env.SETTLEMENT_ENABLED &&
    (!env.SETTLEMENT_SENDER_ID ||
      !env.SETTLEMENT_BOOTSTRAP_MESSAGE_ID ||
      !SETTLEMENT_PARSER_READY)
  ) {
    releaseOwnership();
    throw new Error(
      "Settlement ingestion requires verified sender/bootstrap message IDs and a finalized raw-message parser",
    );
  }
  let wakeTradeRequests: (() => void) | undefined = undefined;
  const traderRuleProcessor = createTraderRuleProcessor({
    store,
    delivery: {
      ready: async (userId) => {
        await sessions.requireConnected(userId);
      },
      group: (userId, text) => sessions.sendGroup(userId, text),
      private: notify,
    },
  });
  const marketIngestion = createMarketIngestion(
    store,
    {
      groupId: env.TELEGRAM_GROUP_ID!,
      senderId: env.QUOTE_SENDER_ID!,
    },
    () => wakeTradeRequests?.(),
    traderRuleProcessor,
  );
  const financialIngestion = createFinancialIngestionCoordinator(
    store,
    sessions,
    {
      groupId: env.TELEGRAM_GROUP_ID!,
      quoteSenderId: env.QUOTE_SENDER_ID!,
      settlementSenderId: env.SETTLEMENT_SENDER_ID,
      settlementEnabled: env.SETTLEMENT_ENABLED,
      settlementBootstrapMessageId: env.SETTLEMENT_BOOTSTRAP_MESSAGE_ID,
    },
    marketIngestion,
  );
  sessions.onQuote = financialIngestion.onMessage;
  sessions.onMutation = financialIngestion.onMutation;
  sessions.onReady = financialIngestion.recover;
  if (env.SETTLEMENT_ENABLED)
    await store.beginFinancialRecovery(env.TELEGRAM_GROUP_ID!);
  const initializeStartedAt = Date.now();
  const operations = new SessionOperations(store, sessions);
  try {
    await sessions.initialize();
  } catch (error) {
    releaseOwnership();
    throw error;
  }
  workerLog.info("telegram.sessions.initialized", {
    durationMs: Date.now() - initializeStartedAt,
  });
  await store.initializeTradeRequests(env.TELEGRAM_GROUP_ID!);
  const recoveredRequests = await store.recoverRequests();
  if (recoveredRequests.length)
    workerLog.info("request.recovery.unknown", {
      count: recoveredRequests.length,
    });
  const requests = createRequestExecutor(
    store,
    {
      ready: async (userId) => {
        await sessions.requireConnected(userId);
      },
      group: (userId, text) => sessions.sendGroup(userId, text),
      private: notify,
    },
    env.TELEGRAM_GROUP_ID!,
  );
  const tradeRequests = createTradeRequestProcessor(
    store,
    requests,
    env.TELEGRAM_GROUP_ID!,
  );
  wakeTradeRequests = tradeRequests.wake;
  tradeRequests.wake();
  sessions.forceSend = (userId, id) => requests.execute(userId, id);
  const server = serve({
    fetch: createWorkerApp(
      sessions,
      env.WORKER_INTERNAL_TOKEN!,
      checkDatabaseHealth,
      operations,
    ).fetch,
    port: 3002,
  });
  workerLog.info("worker.ready", { internalPort: 3002 });
  void notifyRecoveredRequests(recoveredRequests, store.owner, notify).catch(
    (error: unknown) =>
      workerLog.failure("request.recovery_notifications.failed", error),
  );
  let syncing = false;
  const sync = async () => {
    if (syncing) return;
    syncing = true;
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
    } finally {
      syncing = false;
    }
  };
  const pruneTimer = setInterval(() => {
    void store
      .pruneRequests()
      .catch((error: unknown) =>
        workerLog.failure("request.prune.failed", error),
      );
  }, 3600_000);
  await store.pruneRequests();
  const timer = setInterval(() => {
    void sync();
  }, 30_000);
  void sync();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    workerLog.info("worker.stopping");
    clearInterval(timer);
    clearInterval(pruneTimer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await tradeRequests.stop();
    await sessions.stop();
    await financialIngestion.drain();
    await operations.stop();
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
