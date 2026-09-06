import { createHash } from "node:crypto";
import { AppError } from "@zarbit/contracts";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue = boolean | number | string | null | undefined;
export type LogContext = Record<string, LogValue>;
type FailureCategory =
  "application" | "database" | "network" | "telegram_rpc" | "unknown";

const sensitiveValue =
  /(bearer\s+)[^\s,]+|((?:"?(?:api[_-]?hash|apiHash|authorization|hash|init[_-]?data|initData|password|phone(?:Code(?:Hash)?)?|secret|session(?:Key)?|token|code)"?\s*[=:]\s*))(?:"[^"]*"|'[^']*'|[^\s,}&]+)/gi;
const phoneNumber = /\+?\d[\d\s().-]{6,}\d/g;
const longSecret = /\b(?:[a-f\d]{32,}|[A-Za-z\d_-]{40,})\b/gi;
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
      typeof value === "string" ? redact(value) : value,
    ]),
  );
}

function sourceCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("errorMessage" in error && typeof error.errorMessage === "string")
    return error.errorMessage;
  if ("code" in error && typeof error.code === "string") return error.code;
}

function property(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== "object" || !(key in error)) return;
  const value = error[key as keyof typeof error];
  return typeof value === "string" ? value : undefined;
}

function safeSourceCode(code: string | undefined) {
  return code && /^[A-Z][A-Z0-9_]{1,99}$/.test(code) ? code : undefined;
}

function failureCategory(
  error: unknown,
  code: string | undefined,
): FailureCategory {
  if (error instanceof AppError) return "application";
  if (error instanceof Error && error.name.startsWith("Prisma"))
    return "database";
  if (
    code &&
    /^(EAI_AGAIN|ECONN|ENET|EHOST|ETIMEDOUT|NETWORK_ERROR)$/.test(code)
  )
    return "network";
  if (code && /^[A-Z][A-Z0-9_]{1,99}$/.test(code)) return "telegram_rpc";
  return "unknown";
}

function errorContext(error: unknown): LogContext {
  const appError = error instanceof AppError ? error : undefined;
  const code = sourceCode(error);
  const safeCode = safeSourceCode(code);
  const errorCode = safeCode ?? (appError ? appError.code : "NETWORK_ERROR");
  const context: LogContext = {
    errorCode,
    failureCategory: failureCategory(error, code),
    ...(safeCode ? { sourceCode: safeCode } : {}),
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(property(error, "errno")
      ? { errno: redact(property(error, "errno")!) }
      : {}),
    ...(property(error, "syscall")
      ? { syscall: redact(property(error, "syscall")!) }
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
    const causeCode = sourceCode(cause);
    const suffix = `cause${index}`;
    context[`${suffix}Name`] =
      cause instanceof Error ? cause.name : "UnknownError";
    if (safeSourceCode(causeCode))
      context[`${suffix}Code`] = safeSourceCode(causeCode);
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
