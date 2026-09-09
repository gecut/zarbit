import { createHash } from "node:crypto";
import pino, { type DestinationStream, type Logger } from "pino";

export type { Logger } from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<
  string,
  boolean | number | string | null | undefined
>;

export type LoggerConfig = {
  service: "server" | "worker";
  level?: LogLevel;
  releaseId?: string;
  instance?: string;
};

function safeErrorCode(error: Error) {
  const code = Reflect.get(error, "code");
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,99}$/.test(code)
    ? code
    : undefined;
}

function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) return { name: "UnknownError" };

  const cause = Reflect.get(error, "cause");
  return {
    name: error.name,
    ...(safeErrorCode(error) ? { code: safeErrorCode(error) } : {}),
    ...(depth < 3 && cause instanceof Error
      ? { cause: serializeError(cause, depth + 1) }
      : {}),
  };
}

export function correlationRef(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function createLogger(
  config: LoggerConfig,
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level: config.level ?? "info",
      base: {
        schemaVersion: 1,
        service: config.service,
        processId: process.pid,
        ...(config.releaseId ? { releaseId: config.releaseId } : {}),
        ...(config.instance ? { instance: config.instance } : {}),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: { err: serializeError },
      redact: {
        censor: "[redacted]",
        paths: [
          "authorization",
          "token",
          "secret",
          "password",
          "phone",
          "code",
          "hash",
          "initData",
          "init_data",
          "apiHash",
          "sessionKey",
          "phoneCodeHash",
          "body",
          "req.headers.authorization",
          "req.headers.x-telegram-init-data",
          "req.body",
          "request.headers.authorization",
          "request.headers.x-telegram-init-data",
          "request.body",
          "req.body.phone",
          "req.body.password",
          "req.body.code",
        ],
      },
    },
    destination,
  );
}
