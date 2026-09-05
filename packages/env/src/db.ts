import "dotenv/config";
import { z } from "zod";

export const databaseUrl = z
  .string()
  .startsWith("postgresql://")
  .parse(process.env.DATABASE_URL);

export const databasePoolMax = z.coerce
  .number()
  .int()
  .min(1)
  .max(20)
  .default(5)
  .parse(process.env.DATABASE_POOL_MAX);
