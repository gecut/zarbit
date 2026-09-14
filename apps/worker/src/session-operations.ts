import {
  AppError,
  isTelegramOperationPending,
  type TelegramCommandInput,
  type TelegramCommandReceipt,
} from "@zarbit/contracts";
import type { Store } from "@zarbit/db";
import { telegramOperationView } from "@zarbit/db/telegram-operations";
import { errorDetails, safeError } from "./errors";
import { sessionRef, withWorkerContext, workerLog } from "./logger";
import type { Sessions } from "./sessions";

export type OperationStore = Pick<
  Store,
  | "telegramOperation"
  | "acceptTelegramOperation"
  | "claimTelegramOperation"
  | "finishTelegramOperation"
  | "session"
>;

/** Owns detached work, but never persists or automatically replays credentials. */
export class SessionOperations {
  private readonly tasks = new Map<string, Promise<void>>();
  private stopped = false;
  constructor(
    private readonly store: OperationStore,
    private readonly sessions: Sessions,
  ) {}

  async accept(
    userId: string,
    input: TelegramCommandInput,
    requestId: string,
    deadline: number,
  ): Promise<TelegramCommandReceipt> {
    if (this.stopped)
      throw new AppError("STOPPING", "سرویس در حال راه‌اندازی مجدد است.", 503);
    await this.sessions.authorizeOwner(userId);
    const result = await this.store.acceptTelegramOperation(
      userId,
      input,
      requestId,
      deadline,
    );
    const row = result.operation;
    if (
      (result.created ||
        input.command.type === "revoke" ||
        input.command.type === "cancel") &&
      isTelegramOperationPending(telegramOperationView(row))
    ) {
      if (input.command.type === "cancel" || input.command.type === "revoke")
        this.sessions.abortLogin(userId);
      const key = userId + ":" + row.id;
      if (!this.tasks.has(key)) {
        const task = withWorkerContext({ requestId, operationId: row.id }, () =>
          this.execute(userId, input, deadline),
        )
          .catch((error: unknown) =>
            workerLog.failure("telegram.operation.persistence_failed", error, {
              operationId: row.id,
              requestId,
            }),
          )
          .finally(() => this.tasks.delete(key));
        this.tasks.set(key, task);
      }
    }
    return { operationId: row.id, acceptedAt: row.acceptedAt.toISOString() };
  }

  private async execute(
    userId: string,
    input: TelegramCommandInput,
    deadline: number,
  ): Promise<void> {
    const startedAt = Date.now();
    const context = {
      operationId: input.operationId,
      command: input.command.type,
      sessionRef: sessionRef(userId),
    };
    if (
      !(await this.store.claimTelegramOperation(userId, input.operationId))
        .count
    ) {
      workerLog.debug("telegram.operation.claim_skipped", context);
      return;
    }
    workerLog.info("telegram.operation.started", context);
    if (
      Date.now() >= deadline &&
      !["cancel", "revoke"].includes(input.command.type)
    ) {
      await this.store.finishTelegramOperation(
        userId,
        input.operationId,
        "INTERRUPTED",
        {
          code: "ADMISSION_EXPIRED",
          message: "مهلت ثبت عملیات تمام شد؛ دوباره تلاش کنید.",
        },
      );
      return;
    }
    try {
      await this.sessions.command(userId, input.command, input.operationId);
      const latest = await this.store.telegramOperation(
        userId,
        input.operationId,
      );
      if (latest?.status === "CANCEL_REQUESTED") return;
      await this.store.finishTelegramOperation(
        userId,
        input.operationId,
        "SUCCEEDED",
      );
    } catch (error) {
      workerLog.warn("telegram.operation.failed", {
        ...context,
        ...errorDetails(error),
        durationMs: Date.now() - startedAt,
      });
      // A durable cleanup intent outlives this HTTP request and this process.
      if ((await this.store.session(userId))?.state === "REVOKING") {
        if (!["cancel", "revoke"].includes(input.command.type))
          await this.store.finishTelegramOperation(
            userId,
            input.operationId,
            "INTERRUPTED",
            {
              code: "CLEANUP_PENDING",
              message: "عملیات متوقف شد؛ پاک‌سازی اتصال در حال پیگیری است.",
            },
          );
        return;
      }
      const safe = safeError(error);
      await this.store.finishTelegramOperation(
        userId,
        input.operationId,
        "FAILED",
        {
          code: safe.code,
          message: safe.message,
          retryAt: safe.retryAt,
          ...(["PHONE_NUMBER_INVALID", "PHONE_NUMBER_BANNED"].includes(
            safe.code,
          )
            ? { field: "phone" as const }
            : safe.code === "PHONE_CODE_INVALID"
              ? { field: "code" as const }
              : safe.code === "PASSWORD_HASH_INVALID"
                ? { field: "password" as const }
                : {}),
        },
      );
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled(this.tasks.values());
  }
}
