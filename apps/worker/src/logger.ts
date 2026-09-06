import { createHash } from "node:crypto";
import { AppError } from "@zarbit/contracts";
import { errorDetails, rpcCode, stringProperty } from "./errors";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue = boolean | number | string | null | undefined;
export type LogContext = Record<string, LogValue>;

const sensitiveValue =
  /(bearer\s+)[^\s,]+|((?:"?(?:api[_-]?hash|apiHash|authorization|hash|init[_-]?data|initData|password|phone(?:Code(?:Hash)?)?|secret|session(?:Key)?|token|code)"?\s*[=:]\s*))(?:"[^"]*"|'[^']*'|[^\s,}&]+)/gi;
const phoneNumber = /\+?\d[\d\s().-]{6,}\d/g;
const longSecret = /\b(?:[a-f\d]{32,}|[A-Za-z\d_-]{40,})\b/gi;
const opaqueContextKeys = new Set([
  "challengeRef",
  "requestId",
  "retryAt",
  "sessionRef",
]);
const logLevels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function redact(value: string) {
  return value
    .replace(sensitiveValue, "$1$2[redacted]")
    .replace(phoneNumber, "[redacted-number]")
    .replace(longSecret, "[redacted-secret]")
    .slice(0, 500);
}

function redactContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === "string" && !opaqueContextKeys.has(key)
        ? redact(value)
        : value,
    ]),
  );
}

function errorContext(error: unknown): LogContext {
  const appError = error instanceof AppError ? error : undefined;
  const details = errorDetails(error);
  const context: LogContext = {
    errorCode: details.errorCode,
    failureCategory: details.failureCategory,
    ...(details.sourceCode ? { sourceCode: details.sourceCode } : {}),
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(stringProperty(error, "errno")
      ? { errno: redact(stringProperty(error, "errno")!) }
      : {}),
    ...(stringProperty(error, "syscall")
      ? { syscall: redact(stringProperty(error, "syscall")!) }
      : {}),
    ...(error instanceof Error ? { errorMessage: redact(error.message) } : {}),
    ...(error instanceof Error && error.stack
      ? { errorStack: redact(error.stack).slice(0, 2_000) }
      : {}),
    ...(appError ? { errorStatus: appError.status } : {}),
    ...(appError?.retryAt ? { retryAt: appError.retryAt } : {}),
  };
  let cause = error instanceof Error ? error.cause : undefined;
  for (let index = 1; index <= 3 && cause; index++) {
    const suffix = `cause${index}`;
    context[`${suffix}Name`] =
      cause instanceof Error ? cause.name : "UnknownError";
    const causeCode = rpcCode(cause) ?? stringProperty(cause, "code");
    if (causeCode && /^[A-Z][A-Z0-9_]{1,99}$/.test(causeCode))
      context[`${suffix}Code`] = causeCode;
    if (cause instanceof Error)
      context[`${suffix}Message`] = redact(cause.message);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return context;
}

export function sessionRef(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export function challengeRef(id: string) {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

export function formatWorkerLog(
  level: LogLevel,
  event: string,
  context: LogContext = {},
) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "worker",
    ...(process.env.RELEASE_ID ? { releaseId: process.env.RELEASE_ID } : {}),
    ...(process.env.HOSTNAME ? { instance: process.env.HOSTNAME } : {}),
    processId: process.pid,
    level,
    event,
    ...redactContext(context),
  });
}

export function formatWorkerFailure(
  event: string,
  error: unknown,
  context?: LogContext,
) {
  return formatWorkerLog("error", event, {
    ...context,
    ...errorContext(error),
  });
}

export function formatWorkerDiagnostic(
  event: string,
  error: unknown,
  context?: LogContext,
) {
  return formatWorkerLog("error", event, {
    ...context,
    ...errorContext(error),
  });
}

function write(level: LogLevel, event: string, context?: LogContext) {
  const configured = process.env.WORKER_LOG_LEVEL;
  const threshold =
    configured === "debug" ||
    configured === "info" ||
    configured === "warn" ||
    configured === "error"
      ? logLevels[configured]
      : logLevels.info;
  if (logLevels[level] < threshold) return;
  console[level](formatWorkerLog(level, event, context));
}

export const workerLog = {
  debug: (event: string, context?: LogContext) =>
    write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
  failure: (event: string, error: unknown, context?: LogContext) =>
    console.error(formatWorkerFailure(event, error, context)),
  diagnostic: (event: string, error: unknown, context?: LogContext) =>
    console.error(formatWorkerDiagnostic(event, error, context)),
};
