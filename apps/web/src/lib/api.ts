import { env } from "@zarbit/env/web";

import { telegramInitData } from "./telegram";

export type RequestStatus = "ACTIVE" | "DONE" | "CANCELLED" | "FAILED";
export type RequestAction = "ALERT" | "BUY" | "SELL";
export type RequestCondition = "LTE" | "GTE";

export interface ZarbitRequest {
  id: string;
  condition: RequestCondition;
  targetPrice: number;
  action: RequestAction;
  units: number | null;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  triggeredQuote: number | null;
  completedAt: string | null;
  failureReason: string | null;
}

export interface RequestPayload {
  condition: RequestCondition;
  targetPrice: number;
  action: RequestAction;
  units: number | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": telegramInitData(),
      ...init?.headers,
    },
  });
  const body = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? "ارتباط با سرور ناموفق بود.");
  return body.data;
}

export function authenticate() {
  return api<{ telegramUserId: string; firstName: string | null }>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData: telegramInitData() }),
  });
}

export function getRequests(status?: RequestStatus) {
  return api<ZarbitRequest[]>(`/api/requests${status ? `?status=${status}` : ""}`);
}

export function getRequest(id: string) {
  return api<ZarbitRequest>(`/api/requests/${id}`);
}

export function createRequest(payload: RequestPayload) {
  return api<ZarbitRequest>("/api/requests", { method: "POST", body: JSON.stringify(payload) });
}

export function updateRequest(id: string, payload: RequestPayload) {
  return api<ZarbitRequest>(`/api/requests/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function cancelRequest(id: string) {
  return api<ZarbitRequest>(`/api/requests/${id}`, { method: "DELETE" });
}
