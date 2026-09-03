import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default("file:./local.db"),
    TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
    TELEGRAM_API_HASH: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_GROUP_ID: z.string().min(1).optional(),
    QUOTE_SENDER_ID: z.string().min(1).optional(),
    TELEGRAM_SESSION_PATH: z.string().min(1).default("/data/zarbit.session"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
