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
  if (
    data?.login ||
    data?.state === "REVOKING" ||
    data?.connection === "CONNECTING"
  )
    return 2000;
  if (data?.connection === "OFFLINE" || data?.connection === "DEGRADED") return 5000;
  if (data?.state === "DISCONNECTED" || data?.state === "REVOKED") return false;
  return 5000;
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
