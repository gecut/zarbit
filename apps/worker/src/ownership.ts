import { DatabaseSync } from "node:sqlite";
import { lstat } from "node:fs/promises";
import path from "node:path";

/** An OS-backed SQLite lock prevents two workers opening the same session volume. */
export async function acquireWorkerOwnership(
  directory: string,
): Promise<() => void> {
  const filename = path.join(directory, ".worker-owner.sqlite");
  try {
    if ((await lstat(filename)).isSymbolicLink())
      throw new Error("Worker lock symlinks are forbidden");
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ))
      throw error;
  }
  const lock = new DatabaseSync(filename);
  try {
    lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;");
  } catch {
    lock.close();
    throw new Error(
      "Another worker owns this session volume. Stop it before starting this worker.",
    );
  }
  return () => {
    lock.exec("ROLLBACK");
    lock.close();
  };
}
