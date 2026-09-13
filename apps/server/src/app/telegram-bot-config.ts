export function assertTelegramBotConfiguration(
  nodeEnv: "development" | "production" | "test",
  telegramBotToken: string | undefined,
): void {
  if (nodeEnv === "production" && !telegramBotToken)
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
}
