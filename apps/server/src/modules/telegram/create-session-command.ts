import {
  AppError,
  presentTelegramSession,
  TELEGRAM_CONTRACT_VERSION,
  type WorkerCommand,
  type TelegramSessionStatus,
} from "@zarbit/contracts";
import { sendWorkerCommand } from "../../integrations/worker/send-worker-command";
import type {
  WorkerDiagnostic,
  WorkerTransportDependencies,
} from "../../integrations/worker/worker-types";
import type { SessionReader } from "./session-reader";

export interface SessionCommandDependencies extends WorkerTransportDependencies {
  log: (
    event: "worker.command.failed",
    details: WorkerDiagnostic & {
      failure: NonNullable<WorkerDiagnostic["failure"]>;
    },
  ) => void;
  observe?: (event: string, details: WorkerDiagnostic) => void;
  store: SessionReader;
}

const unavailableMessage =
  "سرویس اتصال موقتاً در دسترس نیست؛ وضعیت را تازه کنید و دوباره تلاش کنید.";
const offlineMessage =
  "سرویس اتصال موقتاً در دسترس نیست؛ وضعیت ذخیره‌شده نمایش داده می‌شود.";

function unavailableError() {
  return new AppError("WORKER_UNAVAILABLE", unavailableMessage, 503);
}

async function offlineStatus(
  userId: string,
  dependencies: SessionCommandDependencies,
  diagnostic: WorkerDiagnostic,
): Promise<TelegramSessionStatus> {
  try {
    const session = await dependencies.store.session(userId);
    const operation = await dependencies.store.activeTelegramOperation(userId);
    const observedAt = new Date().toISOString();
    return presentTelegramSession({
      contractVersion: TELEGRAM_CONTRACT_VERSION,
      authorization: !session
        ? "DISCONNECTED"
        : session.state === "REVOKING"
          ? "REVOKING"
          : session.state === "REVOKED"
            ? "REVOKED"
            : session.connectedTelegramUserId
              ? "AUTHORIZED"
              : session.state === "PENDING_OTP"
                ? "LOGIN_PENDING"
                : "ERROR",
      worker: "UNAVAILABLE",
      source: "STORED",
      connection: "UNKNOWN",
      membership:
        session?.state === "NOT_IN_GROUP"
          ? "NOT_MEMBER"
          : session?.membershipCheckedAt && session.connectedTelegramUserId
            ? "MEMBER"
            : "UNKNOWN",
      revision: session?.revision ?? 0,
      version: session?.version ?? 0,
      observedAt,
      stateChangedAt: session?.stateChangedAt.toISOString() ?? observedAt,
      retryAt: null,
      activeOperationId: operation?.id ?? null,
      challengeId: session?.state === "PENDING_OTP" ? session.loginId : null,
      groupId: null,
      quoteSenderId: null,
      connectedTelegramUserId: session?.connectedTelegramUserId ?? null,
      membershipCheckedAt: session?.membershipCheckedAt?.toISOString() ?? null,
      login: null,
      issue: { code: "WORKER_UNAVAILABLE", message: offlineMessage },
    });
  } catch (err) {
    dependencies.log("worker.command.failed", {
      ...diagnostic,
      command: "status",
      failure: "fallback-storage",
      stage: "storage",
      err,
    });
    throw unavailableError();
  }
}

export function createSessionCommand(dependencies: SessionCommandDependencies) {
  let lastStatusFailure: { key: string; at: number } | undefined;
  return async (
    userId: string,
    command: WorkerCommand,
    requestId?: string,
  ): Promise<TelegramSessionStatus> => {
    const result = await sendWorkerCommand(
      dependencies,
      userId,
      command,
      requestId,
    );
    if (result.ok) {
      if (command.type === "status" && lastStatusFailure)
        dependencies.observe?.(
          "worker.connection.recovered",
          result.diagnostic,
        );
      if (command.type === "status") lastStatusFailure = undefined;
      dependencies.observe?.("worker.command.completed", result.diagnostic);
      return result.data;
    }
    const { diagnostic } = result;
    const failure = diagnostic.failure ?? "invalid_response";
    const key = `${failure}:${diagnostic.stage}:${diagnostic.httpStatus}:${diagnostic.responseCode}`;
    const now = Date.now();
    if (
      command.type !== "status" ||
      lastStatusFailure?.key !== key ||
      now - lastStatusFailure.at >= 60_000
    ) {
      dependencies.log("worker.command.failed", { ...diagnostic, failure });
      if (command.type === "status") lastStatusFailure = { key, at: now };
    }
    if (command.type === "status")
      return offlineStatus(userId, dependencies, diagnostic);
    if (
      "error" in result &&
      result.error &&
      [400, 404, 409, 429, 503].includes(diagnostic.httpStatus ?? 0)
    ) {
      throw new AppError(
        result.error.code,
        result.error.message,
        diagnostic.httpStatus!,
        result.error.retryAt,
      );
    }
    throw unavailableError();
  };
}
