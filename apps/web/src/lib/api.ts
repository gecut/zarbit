import { env } from "@zarbit/env/web";
import { telegramInitData } from "./telegram";
import {
  AppError,
  type Identity,
  type RequestPayload,
  type RequestPage,
  type RequestStatus,
  type ZarbitRequest,
  type TelegramSessionStatus,
  type WorkerCommand,
} from "@zarbit/contracts";
export type {
  RequestStatus,
  RequestAction,
  RequestCondition,
  RequestPayload,
  ZarbitRequest,
  TelegramSessionState,
} from "@zarbit/contracts";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, env.VITE_SERVER_URL), {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": telegramInitData(),
        ...init?.headers,
      },
    });
  } catch {
    throw new AppError(
      "NETWORK",
      "ارتباط برقرار نشد؛ وضعیت را تازه کنید.",
      503,
    );
  }
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string; retryAt?: string };
  } | null;
  if (!response.ok || body?.data === undefined)
    throw new AppError(
      body?.error?.code ?? "API_ERROR",
      body?.error?.message ?? "پاسخ معتبری دریافت نشد.",
      response.status,
      body?.error?.retryAt,
    );
  return body.data;
}
export const authenticate = () =>
  api<Identity>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData: telegramInitData() }),
  });
export const getRequests = (status?: RequestStatus | "HISTORY", page = 1) =>
  api<RequestPage>(
    `/api/requests?page=${page}${status ? `&status=${status}` : ""}`,
  );
export const getRequest = (id: string) =>
  api<ZarbitRequest>(`/api/requests/${id}`);
export const createRequest = (payload: RequestPayload) =>
  api<ZarbitRequest>("/api/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const updateRequest = (id: string, payload: RequestPayload) =>
  api<ZarbitRequest>(`/api/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
export const cancelRequest = (id: string) =>
  api<{ cancelled: boolean }>(`/api/requests/${id}`, { method: "DELETE" });
export const getTelegramSession = () =>
  api<TelegramSessionStatus>("/api/telegram-session/status");
export function sessionCommand(
  command: Exclude<WorkerCommand, { type: "status" }>,
) {
  let path = "/api/telegram-session";
  let method = "POST";
  let body: object | undefined;
  switch (command.type) {
    case "login":
      path += "/login";
      body = { phone: command.phone };
      break;
    case "code":
      path += `/login/${command.id}/code`;
      body = { code: command.code };
      break;
    case "password":
      path += `/login/${command.id}/password`;
      body = { password: command.password };
      break;
    case "resend":
      path += `/login/${command.id}/resend`;
      break;
    case "cancel":
      path += `/login/${command.id}`;
      method = "DELETE";
      break;
    case "membership":
      path += "/membership-check";
      break;
    case "revoke":
      method = "DELETE";
      break;
  }
  return api<TelegramSessionStatus>(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}
