import "dotenv/config";
import { z } from "zod";

export const databaseUrl = z
  .string()
  .startsWith("file:")
  .parse(process.env.DATABASE_URL ?? "file:./local.db");
