import { Dispatcher } from "@mtcute/dispatcher";
import { TelegramClient } from "@mtcute/node";
import {
  claimRequest,
  completeClaimedRequest,
  failClaimedRequest,
  failOutstandingClaims,
  findMatchingRequests,
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

function sameConfiguredChat(actualId: number, configuredId: string): boolean {
  const actual = String(actualId);
  return actual === configuredId || `-100${actual}` === configuredId;
}

async function notify(bot: Bot | null, telegramUserId: string, text: string, event: string) {
  if (!bot) return;
  try {
    await bot.api.sendMessage(telegramUserId, text);
  } catch (error) {
    console.warn(`${event}: notification failed`, error instanceof Error ? error.message : error);
  }
}

export async function startWorker() {
  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH || !env.TELEGRAM_GROUP_ID || !env.QUOTE_SENDER_ID) {
    throw new Error("Worker Telegram configuration is incomplete.");
  }
  const groupId = env.TELEGRAM_GROUP_ID;
  const quoteSenderId = env.QUOTE_SENDER_ID;

  const recovered = await failOutstandingClaims();
  if (recovered.count > 0) console.warn(`worker recovered ${recovered.count} unfinished claim(s) as FAILED`);

  const client = new TelegramClient({
    apiId: env.TELEGRAM_API_ID,
    apiHash: env.TELEGRAM_API_HASH,
    storage: env.TELEGRAM_SESSION_PATH,
  });
  const dispatcher = Dispatcher.for(client);
  const notificationBot = env.TELEGRAM_BOT_TOKEN ? new Bot(env.TELEGRAM_BOT_TOKEN) : null;

  dispatcher.onNewMessage(async (message) => {
    if (!sameConfiguredChat(message.chat.id, groupId) || String(message.sender.id) !== quoteSenderId) {
      console.debug("quote ignored: unexpected chat or sender");
      return;
    }

    const quote = parseQuoteMessage(message.text);
    if (!quote) {
      console.debug("quote ignored: invalid format");
      return;
    }

    console.info(`quote accepted: ${quote}`);
    const requests = await findMatchingRequests(quote);
    for (const request of requests) {
      console.info(`request matched: ${request.id}`);
      const claimed = await claimRequest(request.id);
      if (!claimed?.claimToken) continue;
      console.info(`request claimed: ${claimed.id}`);

      if (claimed.action === "ALERT") {
        try {
          if (!notificationBot) throw new Error("Telegram bot token is not configured.");
          await notificationBot.api.sendMessage(
            claimed.user.telegramUserId,
            buildAlertMessage({ quote, targetPrice: claimed.targetPrice }),
          );
          await completeClaimedRequest({ requestId: claimed.id, claimToken: claimed.claimToken, quote, messageId: message.id });
          console.info(`alert sent: ${claimed.id}`);
        } catch (error) {
          await failClaimedRequest({
            requestId: claimed.id,
            claimToken: claimed.claimToken,
            quote,
            messageId: message.id,
            reason: error instanceof Error ? error.message : "Alert delivery failed",
          });
          console.error("alert failed", error instanceof Error ? error.message : error);
        }
        continue;
      }

      try {
        await message.replyText(buildTradeMessage({ action: claimed.action, units: claimed.units!, quote }));
        await completeClaimedRequest({ requestId: claimed.id, claimToken: claimed.claimToken, quote, messageId: message.id });
        console.info(`trade sent: ${claimed.id}`);
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
        console.error("trade failed", error instanceof Error ? error.message : error);
        await notify(notificationBot, claimed.user.telegramUserId, buildTradeFailureMessage(), "trade failure");
      }
    }
  });

  const self = await client.start();
  console.info(`worker connected as ${self.displayName}`);
  return client;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker().catch((error: unknown) => {
    console.error("worker failed to start", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
