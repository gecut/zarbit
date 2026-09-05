import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { prepareVolumes } from "./prepare-volumes.mjs";

await prepareVolumes();
// Refuse migration while a new-version worker owns the session volume.
const lock = new DatabaseSync("/sessions/.worker-owner.sqlite");
try {
  lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;");
  const result = spawnSync(
    process.execPath,
    [
      "/app/packages/db/node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      "/app/packages/db/prisma.config.ts",
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  lock.close();
  await prepareVolumes();
}
