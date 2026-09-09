import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  telegramSessionStatusSchema,
  WORKER_DIAGNOSTIC_USER_ID,
  type WorkerCommand,
} from "@zarbit/contracts";

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
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  reasonCode: z.string().optional(),
  messageKey: z.string().optional(),
  requestId: z.string().optional(),
  retryAt: z.string().optional(),
});
const envelopeSchema = z.object({ error: errorSchema });
const successSchema = z.object({ data: telegramSessionStatusSchema });

export function classifyWorkerFailure(error: unknown): WorkerFailure {
  let cause = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    const code = Reflect.get(cause, "code");
    if (
      cause.name === "TimeoutError" ||
      cause.name === "AbortError" ||
      [
        "ETIMEDOUT",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_BODY_TIMEOUT",
      ].includes(code)
    )
      return "timeout";
    if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
    if (code === "ECONNREFUSED") return "connection_refused";
    if (
      typeof code === "string" &&
      /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE)/.test(
        code,
      )
    )
      return "tls";
    cause = Reflect.get(cause, "cause");
  }
  return "network";
}

export async function sendWorkerCommand(
  deps: WorkerTransportDependencies,
  userId: string,
  command: WorkerCommand,
  requestId = randomUUID(),
) {
  const started = Date.now();
  const diagnostic: WorkerDiagnostic = {
    requestId,
    command: command.type,
    durationMs: 0,
  };
  const failed = (
    failure: WorkerFailure,
    stage: WorkerStage,
    err?: unknown,
  ) => {
    Object.assign(diagnostic, {
      failure,
      stage,
      durationMs: Date.now() - started,
      ...(err === undefined ? {} : { err }),
    });
    return { ok: false as const, diagnostic };
  };
  let url: URL;
  try {
    url = new URL("/internal/command", deps.workerInternalUrl);
    diagnostic.workerUrl = url.host;
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return failed("unconfigured", "url");
  } catch (error) {
    return failed("unconfigured", "url", error);
  }
  if (!deps.workerInternalToken) return failed("unconfigured", "configuration");
  let response: Response;
  let body: unknown;
  try {
    response = await deps.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deps.workerInternalToken}`,
        "X-Request-Id": diagnostic.requestId,
      },
      body: JSON.stringify({ userId, command }),
      signal: AbortSignal.timeout(command.type === "status" ? 2500 : 25_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    return failed(classifyWorkerFailure(error), "fetch", error);
  }
  diagnostic.httpStatus = response.status;
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    return failed("unauthorized", "http");
  }
  if (
    !(response.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/json")
  ) {
    await response.body?.cancel().catch(() => undefined);
    return failed(response.ok ? "invalid_response" : "http_error", "http");
  }
  try {
    body = await response.json();
  } catch (error) {
    return failed(
      error instanceof SyntaxError
        ? "invalid_response"
        : classifyWorkerFailure(error),
      "json",
      error,
    );
  }
  if (response.ok) {
    const parsed = successSchema.safeParse(body);
    if (!parsed.success) return failed("invalid_response", "schema");
    diagnostic.durationMs = Date.now() - started;
    return { ok: true as const, diagnostic, data: parsed.data.data };
  }
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success) return failed("http_error", "schema");
  diagnostic.responseCode = /^[A-Z][A-Z0-9_]{1,99}$/.test(
    parsed.data.error.code,
  )
    ? parsed.data.error.code
    : "UNKNOWN";
  return { ...failed("worker_error", "worker"), error: parsed.data.error };
}

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
