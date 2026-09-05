import { startWorker } from "./index";
startWorker().catch((error: unknown) => {
  console.error(
    "worker failed to start",
    error instanceof Error ? error.message : "Initialization failed",
  );
  process.exitCode = 1;
});
