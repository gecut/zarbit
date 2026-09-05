import type { WorkerCommand } from "@zarbit/contracts";

export type SessionCommand = Exclude<WorkerCommand, { type: "status" }>;
