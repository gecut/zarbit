import { env } from "@zarbit/env/server";
import { createLogger, type Logger } from "@zarbit/logger";

export const serverLog: Logger = createLogger({
  service: "server",
  level: env.LOG_LEVEL,
  releaseId: process.env.RELEASE_ID,
  instance: process.env.HOSTNAME,
});
