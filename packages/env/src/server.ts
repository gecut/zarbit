import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { parseAllowlist } from "./access";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().startsWith("postgresql://"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    CORS_ORIGIN: z.url().default("http://localhost:3001"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    WORKER_INTERNAL_URL: z.url().default("http://127.0.0.1:3002"),
    WORKER_INTERNAL_TOKEN: z.string().min(32).optional(),
    WEB_APP_URL: z.url().optional(),
    ALLOWED_TELEGRAM_USER_IDS: z.string().default(""),
    DEV_TELEGRAM_USER_ID: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const allowedTelegramUserIds = parseAllowlist(
  env.ALLOWED_TELEGRAM_USER_IDS,
);
