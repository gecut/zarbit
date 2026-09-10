import { randomUUID } from "node:crypto";
import { WORKER_DIAGNOSTIC_USER_ID } from "@zarbit/contracts";
import { sendWorkerCommand } from "./send-worker-command";
import type {
  WorkerDiagnostic,
  WorkerTransportDependencies,
} from "./worker-types";

export async function probeWorker(
  deps: WorkerTransportDependencies,
  log: (event: string, details: WorkerDiagnostic) => void,
) {
  const requestId = randomUUID();
  log("worker.startup_check.started", {
    requestId,
    command: "status",
    durationMs: 0,
  });
  const result = await sendWorkerCommand(
    deps,
    WORKER_DIAGNOSTIC_USER_ID,
    { type: "status" },
    requestId,
  );
  // Only a validated live response proves the worker contract is available.
  const healthy = result.ok && result.data.kind === "ACTIVE";
  if (result.ok && !healthy)
    Object.assign(result.diagnostic, {
      failure: "worker_error",
      stage: "worker",
    });
  log(
    healthy ? "worker.startup_check.completed" : "worker.startup_check.failed",
    result.diagnostic,
  );
  return {
    workerHealth: healthy ? ("ok" as const) : ("degraded" as const),
    workerProbeDurationMs: result.diagnostic.durationMs,
  };
}
