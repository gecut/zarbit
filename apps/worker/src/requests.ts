import { randomUUID } from "node:crypto";
import { AppError } from "@zarbit/contracts";
import type { Store } from "@zarbit/db";
import { formatGroupMessage } from "@zarbit/domain";
import { rpcCode } from "./errors";
import { workerLog } from "./logger";

type RequestStore = Pick<
  Store,
  "requestCandidates" | "claimRequest" | "completeRequest" | "owner"
>;
type Quote = { compactQuote: number; sourceMessageId: number };
export function createRequestExecutor(
  store: RequestStore,
  delivery: {
    ready(userId: string): Promise<void>;
    group(userId: string, text: string): Promise<number>;
    private(telegramUserId: string, text: string): Promise<number>;
  },
  timeoutMs = 15_000,
) {
  const execute = async (userId: string, id: string, quote?: Quote) => {
    // Manual execution must reject before consuming a disconnected request.
    if (!quote) await delivery.ready(userId);
    const token = randomUUID();
    const row = await store.claimRequest(id, userId, token, quote);
    if (!row) {
      if (!quote)
        throw new AppError(
          "REQUEST_CONFLICT",
          "درخواست اجرا شده یا در حال اجراست.",
        );
      return;
    }
    let status: "DONE" | "FAILED" | "UNKNOWN" = "FAILED";
    let outgoingMessageId: number | undefined;
    let failureReason: string | undefined;
    let sending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const owner = await store.owner(userId);
    try {
      await delivery.ready(userId);
      if (!owner) throw new AppError("NOT_FOUND", "صاحب درخواست پیدا نشد.");
      sending = true;
      const price = row.targetPrice;
      const send =
        row.action === "ALERT"
          ? delivery.private(
              owner.telegramUserId,
              `هشدار مظنه: ${price} هزار تومان؛ درخواست ${row.id}`,
            )
          : delivery.group(
              userId,
              formatGroupMessage(row.action, row.units!, price),
            );
      outgoingMessageId = await Promise.race([
        send,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("DELIVERY_TIMEOUT")),
            timeoutMs,
          );
        }),
      ]);
      status = "DONE";
    } catch (error) {
      const code = rpcCode(error);
      const definitive =
        !sending ||
        error instanceof AppError ||
        [
          "CHAT_WRITE_FORBIDDEN",
          "USER_BANNED_IN_CHANNEL",
          "CHANNEL_PRIVATE",
          "CHAT_ADMIN_REQUIRED",
          "AUTH_KEY_UNREGISTERED",
          "SESSION_REVOKED",
          "USER_DEACTIVATED",
        ].includes(code ?? "") ||
        (typeof error === "object" &&
          error !== null &&
          "error_code" in error &&
          [400, 403].includes(Number(error.error_code)));
      status = definitive ? "FAILED" : "UNKNOWN";
      failureReason = definitive
        ? "ارسال انجام نشد؛ اتصال و مجوز ارسال را بررسی کنید."
        : "نتیجه ارسال مشخص نیست؛ پیش از اقدام دوباره، گروه را بررسی کنید.";
      workerLog.failure("request.execution.failed", error, {
        requestId: id,
        status,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    // A persistence failure must never be converted into a retry of the send.
    await store.completeRequest(id, token, {
      status,
      outgoingMessageId,
      failureReason,
    });
    if (owner) {
      try {
        await delivery.private(
          owner.telegramUserId,
          `نتیجه درخواست ${id}: ${status === "DONE" ? "انجام شد" : failureReason}`,
        );
      } catch (error) {
        workerLog.failure("request.notification.failed", error, {
          requestId: id,
        });
      }
    }
  };
  return {
    execute,
    match: async (quote: Quote) => {
      const candidates = await store.requestCandidates(quote.compactQuote);
      await Promise.all(
        candidates.map((row) =>
          execute(row.userId, row.id, quote).catch((error: unknown) =>
            workerLog.failure("request.processing.failed", error, {
              requestId: row.id,
            }),
          ),
        ),
      );
    },
  };
}
