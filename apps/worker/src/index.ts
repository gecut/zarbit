import path from "node:path";

import { Dispatcher } from "@mtcute/dispatcher";
import { TelegramClient } from "@mtcute/node";
import {
  TelegramSessionState,
  claimRequest,
  completeClaimedRequest,
  failClaimedRequest,
  failOutstandingClaims,
  findMatchingRequestsForUser,
  listActiveTelegramSessions,
  markTelegramSessionState,
  refreshTelegramSessionMembership,
} from "@zarbit/db";
import {
  buildAlertMessage,
  buildTradeFailureMessage,
  buildTradeMessage,
  buildTradeSuccessMessage,
  parseQuoteMessage,
} from "@zarbit/domain";
import { env } from "@zarbit/env/worker";
import { Bot } from "grammy";

const SESSION_SYNC_INTERVAL_MS = 10_000;

interface ActiveSessionRecord {
  id: string;
  userId: string;
  storageKey: string | null;
  connectedTelegramUserId: string | null;
  user: { telegramUserId: string };
}

interface SessionRuntime {
  record: ActiveSessionRecord;
  client: TelegramClient;
}

function sameConfiguredChat(actualId: number, configuredId: string): boolean {
  const actual = String(actualId);
  return actual === configuredId || `-100${actual}` === configuredId;
}

function sessionStoragePath(storageKey: string): string {
  return path.join(env.TELEGRAM_SESSIONS_DIR, `${storageKey}.sqlite`);
}

async function notify(bot: Bot | null, telegramUserId: string, text: string, event: string): Promise<void> {
  if (!bot) return;
  try {
    await bot.api.sendMessage(telegramUserId, text);
  } catch (error) {
    console.warn(`${event}: notification failed`, error instanceof Error ? error.message : error);
  }
}

async function invalidateMembership(runtime: SessionRuntime, notificationBot: Bot | null): Promise<void> {
  await markTelegramSessionState({
    userId: runtime.record.userId,
    state: TelegramSessionState.NOT_IN_GROUP,
    error: "این حساب دیگر عضو گروه معامله نیست.",
    membershipChecked: true,
  });
  await notify(notificationBot, runtime.record.user.telegramUserId, "عضویت شما در گروه معامله تأیید نشد؛ درخواست‌های فعال لغو شدند.", "membership invalid");
}

async function verifyMembership(runtime: SessionRuntime, notificationBot: Bot | null): Promise<boolean> {
  try {
    const member = await runtime.client.getChatMember({ chatId: env.TELEGRAM_GROUP_ID!, userId: "self" });
    if (!member) {
      await invalidateMembership(runtime, notificationBot);
      return false;
    }
    await refreshTelegramSessionMembership(runtime.record.userId);
    return true;
  } catch (error) {
    console.warn(`membership check failed for ${runtime.record.userId}`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function processQuote(runtime: SessionRuntime, message: {
  id: number;
  text: string;
  replyText(text: string): Promise<unknown>;
}, quote: number, notificationBot: Bot | null): Promise<void> {
  if (!await verifyMembership(runtime, notificationBot)) return;

  const requests = await findMatchingRequestsForUser(runtime.record.userId, quote);
  for (const request of requests) {
    const claimed = await claimRequest(request.id);
    if (!claimed?.claimToken) continue;

    if (claimed.action === "ALERT") {
      try {
        if (!notificationBot) throw new Error("Telegram bot token is not configured.");
        await notificationBot.api.sendMessage(
          claimed.user.telegramUserId,
          buildAlertMessage({ quote, targetPrice: claimed.targetPrice }),
        );
        await completeClaimedRequest({ requestId: claimed.id, claimToken: claimed.claimToken, quote, messageId: message.id });
      } catch (error) {
        await failClaimedRequest({
          requestId: claimed.id,
          claimToken: claimed.claimToken,
          quote,
          messageId: message.id,
          reason: error instanceof Error ? error.message : "Alert delivery failed",
        });
      }
      continue;
    }

    try {
      await message.replyText(buildTradeMessage({ action: claimed.action, units: claimed.units!, quote }));
      await completeClaimedRequest({ requestId: claimed.id, claimToken: claimed.claimToken, quote, messageId: message.id });
      await notify(
        notificationBot,
        claimed.user.telegramUserId,
        buildTradeSuccessMessage({ action: claimed.action, units: claimed.units!, quote }),
        "trade success",
      );
    } catch (error) {
      await failClaimedRequest({
        requestId: claimed.id,
        claimToken: claimed.claimToken,
        quote,
        messageId: message.id,
        reason: error instanceof Error ? error.message : "Trade reply failed",
      });
      await notify(notificationBot, claimed.user.telegramUserId, buildTradeFailureMessage(), "trade failure");
    }
  }
}

async function startSessionRuntime(record: ActiveSessionRecord, notificationBot: Bot | null): Promise<SessionRuntime | null> {
  if (!record.storageKey || !record.connectedTelegramUserId) return null;
  const client = new TelegramClient({
    apiId: env.TELEGRAM_API_ID!,
    apiHash: env.TELEGRAM_API_HASH!,
    storage: sessionStoragePath(record.storageKey),
  });
  const runtime: SessionRuntime = { record, client };
  const dispatcher = Dispatcher.for(client);

  dispatcher.onNewMessage(async (message) => {
    if (!sameConfiguredChat(message.chat.id, env.TELEGRAM_GROUP_ID!) || String(message.sender.id) !== env.QUOTE_SENDER_ID) return;
    const quote = parseQuoteMessage(message.text);
    if (!quote) return;
    await processQuote(runtime, message, quote, notificationBot);
  });

  try {
    const self = await client.start();
    if (String(self.id) !== record.connectedTelegramUserId) {
      await markTelegramSessionState({
        userId: record.userId,
        state: TelegramSessionState.REVOKED,
        error: "هویت نشست تلگرام با مالک آن تطابق ندارد.",
      });
      await client.destroy();
      return null;
    }
    console.info(`worker connected session ${record.id} as ${self.displayName}`);
    return runtime;
  } catch (error) {
    console.error(`worker failed to start session ${record.id}`, error instanceof Error ? error.message : error);
    await client.destroy().catch(() => undefined);
    return null;
  }
}

export async function startWorker() {
  const missing = [
    !env.TELEGRAM_API_ID && "TELEGRAM_API_ID",
    !env.TELEGRAM_API_HASH && "TELEGRAM_API_HASH",
    !env.TELEGRAM_GROUP_ID && "TELEGRAM_GROUP_ID",
    !env.QUOTE_SENDER_ID && "QUOTE_SENDER_ID",
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) {
    throw new Error(`Worker Telegram configuration is incomplete: ${missing.join(", ")}.`);
  }
  const recovered = await failOutstandingClaims();
  if (recovered.count > 0) console.warn(`worker recovered ${recovered.count} unfinished claim(s) as FAILED`);

  const runtimes = new Map<string, SessionRuntime>();
  const notificationBot = env.TELEGRAM_BOT_TOKEN ? new Bot(env.TELEGRAM_BOT_TOKEN) : null;

  const synchronize = async () => {
    const sessions = await listActiveTelegramSessions() as ActiveSessionRecord[];
    const desired = new Set(sessions.map((session) => session.id));
    for (const [sessionId, runtime] of runtimes) {
      if (!desired.has(sessionId)) {
        runtimes.delete(sessionId);
        await runtime.client.destroy().catch(() => undefined);
      }
    }
    for (const session of sessions) {
      if (runtimes.has(session.id)) continue;
      const runtime = await startSessionRuntime(session, notificationBot);
      if (runtime) runtimes.set(session.id, runtime);
    }
  };

  await synchronize();
  const timer = setInterval(() => {
    synchronize().catch((error: unknown) => console.error("worker session sync failed", error instanceof Error ? error.message : error));
  }, SESSION_SYNC_INTERVAL_MS);

  return {
    stop: async () => {
      clearInterval(timer);
      await Promise.all([...runtimes.values()].map((runtime) => runtime.client.destroy().catch(() => undefined)));
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((error: unknown) => {
    console.error("worker failed to start", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
