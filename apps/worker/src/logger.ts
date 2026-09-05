import { createHash } from "node:crypto";
import { AppError } from "@zarbit/contracts";
import { rpcCode } from "./errors";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue = boolean | number | string | null | undefined;
type LogContext = Record<string, LogValue>;

const sensitiveValue =
  /(bearer\s+)[^\s]+|((?:api[_-]?hash|authorization|hash|init[_-]?data|password|phone|secret|session|token)\s*[=:]\s*)[^\s,&]+/gi;
const phoneNumber = /\+?\d[\d\s().-]{6,}\d/g;

function redact(value: string) {
  return value
    .replace(sensitiveValue, "$1$2[redacted]")
    .replace(phoneNumber, "[redacted-number]")
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

function errorContext(error: unknown): LogContext {
  const appError = error instanceof AppError ? error : undefined;
  return {
    errorCode: rpcCode(error),
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(error instanceof Error ? { errorMessage: redact(error.message) } : {}),
    ...(error instanceof Error && error.stack
      ? { errorStack: redact(error.stack).slice(0, 2_000) }
      : {}),
    ...(appError ? { errorStatus: appError.status } : {}),
    ...(appError?.retryAt ? { retryAt: appError.retryAt } : {}),
  };
}

export function sessionRef(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export function formatWorkerLog(
  level: LogLevel,
  event: string,
  context: LogContext = {},
) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "worker",
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
  return formatWorkerLog("error", event, { ...context, ...errorContext(error) });
}

function write(level: LogLevel, event: string, context?: LogContext) {
  console[level](formatWorkerLog(level, event, context));
}

export const workerLog = {
  debug: (event: string, context?: LogContext) => write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) => write("error", event, context),
  failure: (event: string, error: unknown, context?: LogContext) =>
    console.error(formatWorkerFailure(event, error, context)),
};
