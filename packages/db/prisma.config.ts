import path from "node:path";

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://zarbit:zarbit@127.0.0.1:5432/zarbit?schema=public",
  },
});
