import { stat } from "node:fs/promises";

type FileState = "present" | "missing" | "unavailable";

async function inspect(filename: string): Promise<{
  state: FileState;
  bytes?: number;
}> {
  try {
    return { state: "present", bytes: (await stat(filename)).size };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT") return { state: "missing" };
    }
    return { state: "unavailable" };
  }
}

/** Safe filesystem-only evidence for SQLite failures. Never logs database URLs. */
export async function databaseDiagnostics(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) return { databaseStorage: "remote" };
  const filename = databaseUrl.slice("file:".length).split(/[?#]/, 1)[0];
  if (!filename || filename === ":memory:")
    return { databaseStorage: "memory" };
  const [database, wal, shm] = await Promise.all([
    inspect(filename),
    inspect(`${filename}-wal`),
    inspect(`${filename}-shm`),
  ]);
  return {
    databaseStorage: "sqlite_file",
    databaseFileState: database.state,
    ...(database.bytes === undefined ? {} : { databaseBytes: database.bytes }),
    databaseWalState: wal.state,
    ...(wal.bytes === undefined ? {} : { databaseWalBytes: wal.bytes }),
    databaseShmState: shm.state,
    ...(shm.bytes === undefined ? {} : { databaseShmBytes: shm.bytes }),
  };
}
