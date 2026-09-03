import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Optional at build time so the worker foundation can be typechecked without credentials. */
export const env = createEnv({
  server: {
    TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
    TELEGRAM_API_HASH: z.string().min(1).optional(),
    TELEGRAM_GROUP_ID: z.string().min(1).optional(),
    QUOTE_SENDER_ID: z.string().min(1).optional(),
    WORKER_KEEP_ALIVE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
