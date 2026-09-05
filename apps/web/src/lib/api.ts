import { env } from "@zarbit/env/web";
import {
  AppError,
  type Identity,
  type RequestPayload,
  type RequestPage,
  type RequestStatus,
  type TelegramSessionStatus,
  type WorkerCommand,
  type ZarbitRequest,
} from "@zarbit/contracts";

import { telegramInitData } from "./telegram";

export type {
  RequestAction,
  RequestCondition,
  RequestPayload,
  RequestStatus,
  TelegramSessionState,
  ZarbitRequest,
} from "@zarbit/contracts";

export interface ApiClient {
  authenticate(): Promise<Identity>;
  getRequests(
    status?: RequestStatus | "HISTORY",
    page?: number,
  ): Promise<RequestPage>;
  getRequest(id: string): Promise<ZarbitRequest>;
  createRequest(payload: RequestPayload): Promise<ZarbitRequest>;
  updateRequest(id: string, payload: RequestPayload): Promise<ZarbitRequest>;
  cancelRequest(id: string): Promise<{ cancelled: boolean }>;
  getTelegramSession(): Promise<TelegramSessionStatus>;
  sessionCommand(
    command: Exclude<WorkerCommand, { type: "status" }>,
  ): Promise<TelegramSessionStatus>;
}

function serverUrl(): string {
  if (env.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  throw new AppError(
    "API_CONFIGURATION",
    "نشانی سرویس برای این محیط تنظیم نشده است.",
    503,
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, serverUrl()), {
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

export function createServerApi(): ApiClient {
  return {
    authenticate: () =>
      request<Identity>("/api/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ initData: telegramInitData() }),
      }),
    getRequests: (status, page = 1) =>
      request<RequestPage>(
        `/api/requests?page=${page}${status ? `&status=${status}` : ""}`,
      ),
    getRequest: (id) => request<ZarbitRequest>(`/api/requests/${id}`),
    createRequest: (payload) =>
      request<ZarbitRequest>("/api/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateRequest: (id, payload) =>
      request<ZarbitRequest>(`/api/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    cancelRequest: (id) =>
      request<{ cancelled: boolean }>(`/api/requests/${id}`, {
        method: "DELETE",
      }),
    getTelegramSession: () =>
      request<TelegramSessionStatus>("/api/telegram-session/status"),
    sessionCommand: (command) => {
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

      return request<TelegramSessionStatus>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
    },
  };
}
