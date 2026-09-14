import { z } from "zod";
import {
  AppError,
  telegramCommandReceiptSchema,
  type TelegramCommandInput,
  type TelegramCommandReceipt,
} from "@zarbit/contracts";
import type { WorkerTransportDependencies } from "./worker-types";

const responseSchema = z.object({ data: telegramCommandReceiptSchema });
const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAt: z.string().datetime().optional(),
  }),
});
export async function sendWorkerOperation(
  deps: WorkerTransportDependencies,
  userId: string,
  input: TelegramCommandInput,
  requestId: string,
): Promise<TelegramCommandReceipt> {
  const unavailable = () =>
    new AppError(
      "WORKER_UNAVAILABLE",
      "ثبت عملیات تأیید نشد؛ نتیجه را دوباره بررسی کنید.",
      503,
    );
  if (!deps.workerInternalToken) throw unavailable();
  let response: Response;
  try {
    const url = new URL("/internal/operation", deps.workerInternalUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw unavailable();
    response = await deps.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + deps.workerInternalToken,
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({ userId, input, deadline: Date.now() + 5000 }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw unavailable();
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const parsed = responseSchema.safeParse(body);
    if (parsed.success) return parsed.data.data;
  } else {
    const parsed = errorSchema.safeParse(body);
    if (
      parsed.success &&
      [400, 403, 404, 409, 429, 503].includes(response.status)
    ) {
      if (parsed.data.error.code === "INTERNAL_AUTH_INVALID")
        throw unavailable();
      throw new AppError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.retryAt,
      );
    }
  }
  throw unavailable();
}
