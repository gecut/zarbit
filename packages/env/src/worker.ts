import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { parseAllowlist } from "./access";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().startsWith("postgresql://"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
    TELEGRAM_API_HASH: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_GROUP_ID: z.coerce.number().int().safe().negative().optional(),
    QUOTE_SENDER_ID: z.string().min(1).optional(),
    TELEGRAM_SESSIONS_DIR: z.string().min(1).default("./telegram-sessions"),
    MAX_TELEGRAM_SESSIONS: z.coerce.number().int().min(1).max(20).default(20),
    WORKER_INTERNAL_TOKEN: z.string().min(32).optional(),
    ALLOWED_TELEGRAM_USER_IDS: z.string().default(""),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
export const allowedTelegramUserIds = parseAllowlist(
  env.ALLOWED_TELEGRAM_USER_IDS,
);
