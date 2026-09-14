import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  telegramSessionStatusSchema,
  type WorkerCommand,
} from "@zarbit/contracts";
import { classifyWorkerFailure } from "./classify-worker-failure";
import type {
  WorkerDiagnostic,
  WorkerFailure,
  WorkerStage,
  WorkerTransportDependencies,
} from "./worker-types";

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

export async function sendWorkerCommand(
  deps: WorkerTransportDependencies,
  userId: string,
  command: WorkerCommand,
  requestId: string = randomUUID(),
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
