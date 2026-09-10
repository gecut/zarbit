import type { WorkerCommand } from "@zarbit/contracts";

export type WorkerFailure =
  | "unconfigured"
  | "dns"
  | "connection_refused"
  | "timeout"
  | "tls"
  | "network"
  | "http_error"
  | "invalid_response"
  | "unauthorized"
  | "worker_error"
  | "fallback-storage";

export type WorkerStage =
  | "configuration"
  | "url"
  | "fetch"
  | "http"
  | "json"
  | "schema"
  | "worker"
  | "storage";

export type WorkerDiagnostic = {
  requestId: string;
  command: WorkerCommand["type"];
  workerUrl?: string;
  durationMs: number;
  failure?: WorkerFailure;
  stage?: WorkerStage;
  httpStatus?: number;
  responseCode?: string;
  err?: unknown;
};

export type WorkerTransportDependencies = {
  fetch: typeof globalThis.fetch;
  workerInternalToken?: string;
  workerInternalUrl: string;
};
