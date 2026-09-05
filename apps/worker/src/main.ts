import { startWorker } from "./index";
import { workerLog } from "./logger";

startWorker().catch((error: unknown) => {
  workerLog.failure("worker.start_failed", error);
  process.exitCode = 1;
});
