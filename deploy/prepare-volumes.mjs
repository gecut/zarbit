import { mkdir, lstat, readdir, chown, chmod } from "node:fs/promises";
// Run only as the stopped-service migration job; never recursively follow links.
export async function prepareVolumes() {
  const directory = "/sessions";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Expected a real session volume directory");
  await chown(directory, 1000, 1000);
  await chmod(directory, 0o700);
  for (const name of await readdir(directory)) {
    if (!/^(?:[a-f0-9]{64}\.sqlite|\.worker-owner\.sqlite)(?:-wal|-shm|-journal)?$/.test(name))
      continue;
    const file = `${directory}/${name}`;
    if (!(await lstat(file)).isFile())
      throw new Error("Unexpected session entry");
    await chown(file, 1000, 1000);
    await chmod(file, 0o600);
  }
}
