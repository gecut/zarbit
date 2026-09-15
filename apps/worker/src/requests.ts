import { randomUUID } from "node:crypto";
import { AppError } from "@zarbit/contracts";
import type { Store } from "@zarbit/db";
import { formatGroupMessage } from "@zarbit/domain";
import {
  formatAlertMessage,
  formatRequestResultMessage,
  requestFailureText,
  type RequestFailure,
  type MessageLinks,
} from "@zarbit/messages";
import { rpcCode } from "./errors";
import { workerLog } from "./logger";

type RequestStore = Pick<
  Store,
  "claimRequest" | "completeRequest" | "owner" | "markSending"
>;
type ClaimedRequest = NonNullable<
  Awaited<ReturnType<RequestStore["claimRequest"]>>
>;
export function createRequestExecutor(
  store: RequestStore,
  delivery: {
    ready(userId: string): Promise<void>;
    group(userId: string, text: string): Promise<number>;
    private(
      telegramUserId: string,
      text: string,
      links?: MessageLinks,
    ): Promise<number>;
  },
  timeoutMs = 15_000,
) {
  const execute = async (
    userId: string,
    id: string,
    claimed?: ClaimedRequest,
  ) => {
    // Manual execution must reject before consuming a disconnected request.
    if (!claimed) await delivery.ready(userId);
    const token = claimed?.claimToken ?? randomUUID();
    let row = claimed ?? (await store.claimRequest(id, userId, token));
    if (!row) {
      if (!claimed)
        throw new AppError(
          "REQUEST_CONFLICT",
          "درخواست اجرا شده یا در حال اجراست.",
        );
      return;
    }
    let status: "DONE" | "FAILED" | "UNKNOWN" = "FAILED";
    let outgoingMessageId: number | undefined;
    let failureReason: string | undefined;
    let failure: RequestFailure = "unknown";
    let sending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const owner = await store.owner(userId);
    try {
      await delivery.ready(userId);
      if (!owner) throw new AppError("NOT_FOUND", "صاحب درخواست پیدا نشد.");
      const started = await store.markSending(id, token);
      if (!started.count || !started.row) {
        if (!claimed)
          throw new AppError(
            "REQUEST_CONFLICT",
            "درخواست لغو شده یا در حال اجراست.",
          );
        workerLog.info("request.returned_to_waiting_or_cancelled", {
          requestId: id,
          reason: started.reason,
        });
        return;
      }
      row = started.row;
      sending = true;
      const price = row.targetPrice;
      const send =
        row.action === "ALERT"
          ? delivery.private(
              owner.telegramUserId,
              formatAlertMessage({
                ...row,
                trigger:
                  row.triggerSource === "TRADE" &&
                  row.triggeredPrice !== null &&
                  row.triggeredAt
                    ? {
                        compactPrice: row.triggeredPrice,
                        announcedAt: row.triggeredAt,
                      }
                    : undefined,
              }),
              { requestId: id },
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
      failure =
        (error instanceof AppError && error.code === "SESSION_REQUIRED") ||
        [
          "AUTH_KEY_UNREGISTERED",
          "SESSION_REVOKED",
          "USER_DEACTIVATED",
        ].includes(code ?? "")
          ? "connection"
          : [
                "CHAT_WRITE_FORBIDDEN",
                "USER_BANNED_IN_CHANNEL",
                "CHANNEL_PRIVATE",
                "CHAT_ADMIN_REQUIRED",
              ].includes(code ?? "")
            ? "group_permission"
            : row.action === "ALERT" &&
                typeof error === "object" &&
                error !== null &&
                "error_code" in error &&
                error.error_code === 403
              ? "private_permission"
              : "unknown";
      failureReason = requestFailureText(row.action, status, failure);
      workerLog.failure("request.execution.failed", error, {
        requestId: id,
        status,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    // A persistence failure must never be converted into a retry of the send.
    const completed = await store.completeRequest(id, token, {
      status,
      outgoingMessageId,
      failureReason,
    });
    if (
      completed.count &&
      owner &&
      !(row.action === "ALERT" && status === "DONE")
    ) {
      try {
        await delivery.private(
          owner.telegramUserId,
          formatRequestResultMessage({
            ...row,
            status,
            failure,
            manual: !claimed,
            groupText:
              row.action === "ALERT"
                ? undefined
                : formatGroupMessage(row.action, row.units!, row.targetPrice),
          }),
          {
            requestId: id,
            connection:
              status === "FAILED" &&
              (failure === "connection" || failure === "group_permission"),
            groupMessageId:
              row.action !== "ALERT" && status === "DONE"
                ? outgoingMessageId
                : undefined,
          },
        );
      } catch (error) {
        workerLog.failure("request.notification.failed", error, {
          requestId: id,
        });
      }
    }
  };
  return { execute };
}
