import { AppError, type TelegramSessionStatus } from "@zarbit/contracts";

export const fastQuery = {
  staleTime: 2000,
  refetchInterval: 3000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;
export const slowQuery = {
  staleTime: 5 * 60_000,
  gcTime: 15 * 60_000,
  refetchInterval: 5 * 60_000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;
export function sessionInterval(data?: TelegramSessionStatus): number | false {
  return data?.activeOperationId ||
    data?.authorization === "LOGIN_PENDING" ||
    data?.authorization === "REVOKING"
    ? 2000
    : 15_000;
}

export function retryQuery(count: number, error: unknown): boolean {
  if (count >= 2) return false;
  if (error instanceof AppError)
    return error.status === 429 || error.status >= 500;
  return !(error instanceof Error && error.name === "AbortError");
}
export function retryDelay(attempt: number, error: unknown): number {
  const backoff =
    Math.min(1000 * 2 ** attempt, 10_000) + Math.round(Math.random() * 250);
  if (error instanceof AppError && error.retryAt) {
    const retryAt = Date.parse(error.retryAt);
    if (Number.isFinite(retryAt))
      return Math.max(backoff, retryAt - Date.now());
  }
  return backoff;
}

export const marketSnapshotQuery = {
  staleTime: 5_000,
  gcTime: 15 * 60_000,
  refetchInterval: false,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;
export const marketPolling = {
  staleTime: 1000,
  refetchInterval: 3000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;
