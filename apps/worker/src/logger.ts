import { correlationRef, createLogger, type LogContext } from "@zarbit/logger";
import { AsyncLocalStorage } from "node:async_hooks";

const contextStorage = new AsyncLocalStorage<LogContext>();
export const withWorkerContext = <T>(context: LogContext, work: () => T): T =>
  contextStorage.run(context, work);

import { errorDetails, stringProperty } from "./errors";

export const sessionRef = correlationRef;
export const challengeRef = correlationRef;

const logger = createLogger({
  service: "worker",
  level:
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "info",
  releaseId: process.env.RELEASE_ID,
  instance: process.env.HOSTNAME,
});

function errorContext(error: unknown): LogContext {
  const details = errorDetails(error);
  return {
    errorCode: details.errorCode,
    failureCategory: details.failureCategory,
    ...(details.sourceCode ? { sourceCode: details.sourceCode } : {}),
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(stringProperty(error, "errno")
      ? { errno: stringProperty(error, "errno") }
      : {}),
    ...(stringProperty(error, "syscall")
      ? { syscall: stringProperty(error, "syscall") }
      : {}),
  };
}

const write = (
  level: "debug" | "info" | "warn" | "error",
  event: string,
  context?: LogContext,
) => logger[level]({ event, ...contextStorage.getStore(), ...context }, event);

export const workerLog = {
  debug: (event: string, context?: LogContext) =>
    write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
  failure: (event: string, error: unknown, context?: LogContext) =>
    logger.error(
      {
        event,
        ...contextStorage.getStore(),
        ...context,
        ...errorContext(error),
        err: error,
      },
      event,
    ),
  diagnostic: (event: string, error: unknown, context?: LogContext) =>
    logger.error(
      { event, ...context, ...errorContext(error), err: error },
      event,
    ),
};
