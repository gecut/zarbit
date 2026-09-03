import { env } from "@zarbit/env/worker";

/**
 * Foundation entrypoint. Telegram client wiring belongs to a later goal.
 * Credentials remain optional here so normal workspace checks are deterministic.
 */
export function startWorker(): void {
  const configured = Boolean(
    env.TELEGRAM_API_ID &&
      env.TELEGRAM_API_HASH &&
      env.TELEGRAM_GROUP_ID &&
      env.QUOTE_SENDER_ID,
  );

  console.info(`Zarbit worker foundation ready (telegram configured: ${configured})`);

  if (env.WORKER_KEEP_ALIVE) {
    setInterval(() => undefined, 60_000);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
