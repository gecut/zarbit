import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default("file:./local.db"),
    CORS_ORIGIN: z.url().default("http://localhost:3001"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
    TELEGRAM_API_HASH: z.string().min(1).optional(),
    TELEGRAM_GROUP_ID: z.string().min(1).optional(),
    QUOTE_SENDER_ID: z.string().min(1).optional(),
    TELEGRAM_SESSIONS_DIR: z.string().min(1).default("./telegram-sessions"),
    MAX_TELEGRAM_SESSIONS: z.coerce.number().int().min(1).max(20).default(20),
    WEB_APP_URL: z.url().optional(),
    ALLOWED_TELEGRAM_USER_IDS: z.string().default(""),
    DEV_TELEGRAM_USER_ID: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const allowedTelegramUserIds = new Set(
  env.ALLOWED_TELEGRAM_USER_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
