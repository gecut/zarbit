import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default("file:./local.db"),
    CORS_ORIGIN: z.url().default("http://localhost:3001"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
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
