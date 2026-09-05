import {
  AppError,
  telegramSessionStatusSchema,
  type WorkerCommand,
  type TelegramSessionStatus,
} from "@zarbit/contracts";
import { env } from "@zarbit/env/server";
import { store } from "@zarbit/db";

type WorkerFailure =
  | "unconfigured"
  | "network"
  | "invalid-response"
  | "unauthorized-worker"
  | "upstream-error"
  | "fallback-storage";

type WorkerErrorBody = {
  code: string;
  message: string;
  retryAt?: string;
};

type WorkerResponse =
  | { kind: "success"; data: TelegramSessionStatus }
  | { kind: "error"; error: WorkerErrorBody; status: number }
  | { kind: "invalid"; status: number };

export interface WorkerCommandDependencies {
  fetch: typeof globalThis.fetch;
  log: (event: "worker.command.failed", details: {
    command: WorkerCommand["type"];
    failure: WorkerFailure;
    upstreamStatus?: number;
  }) => void;
  store: SessionReader;
  workerInternalToken?: string;
  workerInternalUrl: string;
}

export interface SessionReader {
  session(userId: string): Promise<{
    state: TelegramSessionStatus["state"];
    connectedTelegramUserId: string | null;
    membershipCheckedAt: Date | null;
  } | null>;
}

const unavailableMessage =
  "سرویس اتصال موقتاً در دسترس نیست؛ وضعیت را تازه کنید و دوباره تلاش کنید.";
const offlineMessage =
  "سرویس اتصال موقتاً در دسترس نیست؛ وضعیت ذخیره‌شده نمایش داده می‌شود.";

function isWorkerError(value: unknown): value is WorkerErrorBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const error = value as Record<string, unknown>;
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    (error.retryAt === undefined || typeof error.retryAt === "string")
  );
}

function isExpectedWorkerStatus(status: number) {
  return [400, 404, 409, 429, 503].includes(status);
}

async function readWorkerResponse(response: Response): Promise<WorkerResponse> {
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json"))
    return { kind: "invalid", status };

  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: unknown;
  } | null;

  if (!body || typeof body !== "object" || Array.isArray(body))
    return { kind: "invalid", status };

  if (response.ok) {
    const parsed = telegramSessionStatusSchema.safeParse(body.data);
    return parsed.success
      ? { kind: "success", data: parsed.data }
      : { kind: "invalid", status };
  }

  return isWorkerError(body.error)
    ? { kind: "error", error: body.error, status }
    : { kind: "invalid", status };
}

function unavailableError() {
  return new AppError("WORKER_UNAVAILABLE", unavailableMessage, 503);
}

async function offlineStatus(
  userId: string,
  dependencies: WorkerCommandDependencies,
): Promise<TelegramSessionStatus> {
  try {
    const session = await dependencies.store.session(userId);
    return {
      state: session?.state ?? "DISCONNECTED",
      connection: "OFFLINE",
      connectedTelegramUserId: session?.connectedTelegramUserId ?? null,
      membershipCheckedAt: session?.membershipCheckedAt?.toISOString() ?? null,
      canManageRequests: false,
      login: null,
      error: offlineMessage,
    };
  } catch {
    dependencies.log("worker.command.failed", {
      command: "status",
      failure: "fallback-storage",
    });
    throw unavailableError();
  }
}

export function createWorkerCommand(dependencies: WorkerCommandDependencies) {
  let lastStatusFailure: { key: string; at: number } | undefined;

  return async function workerCommand(
    userId: string,
    command: WorkerCommand,
  ): Promise<TelegramSessionStatus> {
    const fallback = (failure: WorkerFailure, upstreamStatus?: number) => {
      const key = `${failure}:${upstreamStatus ?? ""}`;
      const now = Date.now();
      if (
        lastStatusFailure?.key !== key ||
        now - lastStatusFailure.at >= 60_000
      ) {
        dependencies.log("worker.command.failed", {
          command: "status",
          failure,
          ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
        });
        lastStatusFailure = { key, at: now };
      }
      return offlineStatus(userId, dependencies);
    };
    const unavailable = (failure: WorkerFailure, upstreamStatus?: number) => {
      dependencies.log("worker.command.failed", {
        command: command.type,
        failure,
        ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
      });
      return unavailableError();
    };

    if (!dependencies.workerInternalToken) {
      if (command.type === "status") return fallback("unconfigured");
      throw unavailable("unconfigured");
    }

    let response: Response;

    try {
      response = await dependencies.fetch(
        new URL("/internal/command", dependencies.workerInternalUrl),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${dependencies.workerInternalToken}`,
          },
          body: JSON.stringify({ userId, command }),
          signal: AbortSignal.timeout(25_000),
          cache: "no-store",
        },
      );
    } catch {
      if (command.type === "status") return fallback("network");
      throw unavailable("network");
    }

    const parsed = await readWorkerResponse(response);

    if (parsed.kind === "success") {
      lastStatusFailure = undefined;
      return parsed.data;
    }

    if (command.type === "status")
      return fallback(
        parsed.kind === "error"
          ? parsed.status === 403
            ? "unauthorized-worker"
            : "upstream-error"
          : "invalid-response",
        parsed.status,
      );

    if (parsed.kind === "error") {
      if (parsed.status === 403)
        throw unavailable("unauthorized-worker", parsed.status);

      if (isExpectedWorkerStatus(parsed.status))
        throw new AppError(
          parsed.error.code,
          parsed.error.message,
          parsed.status,
          parsed.error.retryAt,
        );

      throw unavailable("upstream-error", parsed.status);
    }

    throw unavailable("invalid-response", parsed.status);
  };
}

export const workerCommand = createWorkerCommand({
  fetch,
  log: console.error,
  store: { session: async (userId) => store.session(userId) },
  workerInternalToken: env.WORKER_INTERNAL_TOKEN,
  workerInternalUrl: env.WORKER_INTERNAL_URL,
});
