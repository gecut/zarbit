import { env } from "@zarbit/env/web";
import {
  AppError,
  type Identity,
  type QuoteDashboard,
  type TelegramSessionStatus,
  type WorkerCommand,
  type CreateRequestInput,
  type UpdateRequestInput,
  type RequestDetail,
  type RequestHistoryPage,
  type ParticipantAnalyticsSummary,
  type ParticipantAnalyticsDetail,
  type TraderListQuery,
} from "@zarbit/contracts";

import { telegramInitData } from "../telegram/telegram";

export type {
  QuotePoint,
  TradePoint,
  QuoteDashboard,
  TelegramSessionState,
} from "@zarbit/contracts";

export interface LegacyApi {
  authenticate(): Promise<Identity>;
  getQuoteDashboard(): Promise<QuoteDashboard>;
  getTelegramSession(): Promise<TelegramSessionStatus>;
  sessionCommand(
    command: Exclude<WorkerCommand, { type: "status" }>,
  ): Promise<TelegramSessionStatus>;
  getRequest(id: string): Promise<RequestDetail>;
  getActiveRequests(): Promise<RequestDetail[]>;
  getRequestHistory(cursor?: string): Promise<RequestHistoryPage>;
  createRequest(input: CreateRequestInput): Promise<RequestDetail>;
  updateRequest(id: string, input: UpdateRequestInput): Promise<RequestDetail>;
  cancelRequest(id: string): Promise<RequestDetail>;
  forceSendRequest(id: string): Promise<RequestDetail>;
  getTraders(query?: TraderListQuery): Promise<ParticipantAnalyticsSummary[]>;
  getTraderDetail(alias: string): Promise<ParticipantAnalyticsDetail | null>;
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

export function createLegacyApi(): LegacyApi {
  return {
    authenticate: () =>
      request<Identity>("/api/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ initData: telegramInitData() }),
      }),
    getQuoteDashboard: () => request<QuoteDashboard>("/api/quote/dashboard"),
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
    getRequest: (id) =>
      request<RequestDetail>(`/api/requests/${encodeURIComponent(id)}`),
    getActiveRequests: () => request<RequestDetail[]>("/api/requests/active"),
    getRequestHistory: (cursor) =>
      request<RequestHistoryPage>(
        `/api/requests/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    createRequest: (input) =>
      request<RequestDetail>("/api/requests", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateRequest: (id, input) =>
      request<RequestDetail>(`/api/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    cancelRequest: (id) =>
      request<RequestDetail>(`/api/requests/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
      }),
    forceSendRequest: (id) =>
      request<RequestDetail>(
        `/api/requests/${encodeURIComponent(id)}/force-send`,
        { method: "POST" },
      ),
    getTraders: (query) => {
      const params = new URLSearchParams();
      if (query?.sortBy) params.set("sortBy", query.sortBy);
      if (query?.sortOrder) params.set("sortOrder", query.sortOrder);
      if (query?.limit) params.set("limit", String(query.limit));
      const qs = params.toString();
      return request<ParticipantAnalyticsSummary[]>(
        `/api/analytics/traders${qs ? `?${qs}` : ""}`,
      );
    },
    getTraderDetail: (alias) =>
      request<ParticipantAnalyticsDetail | null>(
        `/api/analytics/traders/${encodeURIComponent(alias)}`,
      ),
  };
}
