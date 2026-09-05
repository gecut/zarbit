import { mkdir, lstat, readdir, chown, chmod } from "node:fs/promises";
// Run only as the stopped-service migration job; never recursively follow links.
export async function prepareVolumes() {
  for (const directory of ["/data", "/sessions"]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (!(await lstat(directory)).isDirectory())
      throw new Error("Expected a real volume directory");
    await chown(directory, 1000, 1000);
    await chmod(directory, 0o700);
    for (const name of await readdir(directory)) {
      const allowed =
        directory === "/data"
          ? /^zarbit\.db(?:-wal|-shm|-journal)?$/
          : /^(?:[a-f0-9]{64}\.sqlite|\.worker-owner\.sqlite)(?:-wal|-shm|-journal)?$/;
      if (!allowed.test(name)) continue;
      const file = `${directory}/${name}`;
      if (!(await lstat(file)).isFile())
        throw new Error("Unexpected session or database entry");
      await chown(file, 1000, 1000);
      await chmod(file, 0o600);
    }
  }
}
