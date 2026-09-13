import assert from "node:assert/strict";
import test from "node:test";
import { assertTelegramBotConfiguration } from "../src/app/telegram-bot-config";

test("the Telegram bot token is optional only outside production", () => {
  assert.doesNotThrow(() =>
    assertTelegramBotConfiguration("development", undefined),
  );
  assert.doesNotThrow(() => assertTelegramBotConfiguration("test", undefined));
  assert.throws(
    () => assertTelegramBotConfiguration("production", undefined),
    /TELEGRAM_BOT_TOKEN is required/,
  );
  assert.doesNotThrow(() =>
    assertTelegramBotConfiguration("production", "bot-token"),
  );
});
