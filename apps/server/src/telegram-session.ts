import {
  AppError,
  type WorkerCommand,
  type TelegramSessionStatus,
} from "@zarbit/contracts";
import { env } from "@zarbit/env/server";
import { store } from "@zarbit/db";

export async function workerCommand(
  userId: string,
  command: WorkerCommand,
): Promise<TelegramSessionStatus> {
  if (!env.WORKER_INTERNAL_TOKEN)
    throw new AppError(
      "WORKER_UNAVAILABLE",
      "سرویس اتصال پیکربندی نشده است.",
      503,
    );

  let response: Response;

  try {
    response = await fetch(
      new URL("/internal/command", env.WORKER_INTERNAL_URL),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.WORKER_INTERNAL_TOKEN}`,
        },
        body: JSON.stringify({ userId, command }),
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      },
    );
  } catch {
    if (command.type === "status") {
      const session = await store.session(userId);
      return {
        state: session?.state ?? "DISCONNECTED",
        connection: "OFFLINE",
        connectedTelegramUserId: session?.connectedTelegramUserId ?? null,
        membershipCheckedAt:
          session?.membershipCheckedAt?.toISOString() ?? null,
        canManageRequests: false,
        login: null,
        error: "سرویس اتصال موقتاً در دسترس نیست.",
      };
    }

    throw new AppError(
      "WORKER_UNAVAILABLE",
      "پاسخ سرویس اتصال دریافت نشد؛ وضعیت را تازه کنید و دوباره تلاش کنید.",
      503,
    );
  }

  const body = (await response.json()) as {
    data?: TelegramSessionStatus;
    error?: { code: string; message: string; retryAt?: string };
  };

  if (!response.ok || !body.data)
    throw new AppError(
      body.error?.code ?? "WORKER_ERROR",
      body.error?.message ?? "سرویس اتصال در دسترس نیست.",
      response.status,
      body.error?.retryAt,
    );
    
  return body.data;
}
