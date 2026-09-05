import { chmod, mkdir, readdir, lstat, rm } from "node:fs/promises";
import path from "node:path";

export class SessionFiles {
  constructor(readonly directory: string) {}
  path(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new Error("Invalid session storage key");
    return path.join(this.directory, `${key}.sqlite`);
  }
  async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink())
      throw new Error("Session directory symlinks are forbidden");
    await chmod(this.directory, 0o700);
  }
  async protect(key: string) {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const file = this.path(key) + suffix;
      try {
        if ((await lstat(file)).isSymbolicLink())
          throw new Error("Session symlinks are forbidden");
        await chmod(file, 0o600);
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
      }
    }
  }
  async remove(key: string) {
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      await rm(this.path(key) + suffix, { force: true });
  }
  async cleanOrphans(retained: Set<string>) {
    for (const name of await readdir(this.directory)) {
      const match = /^([a-f0-9]{64})\.sqlite(?:-wal|-shm|-journal)?$/.exec(
        name,
      );
      if (match?.[1] && !retained.has(match[1])) await this.remove(match[1]);
    }
  }
}
