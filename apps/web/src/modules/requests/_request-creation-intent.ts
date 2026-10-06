import type { RequestPriceMode } from "@zarbit/contracts";

export interface RequestCreationIntent {
  userId: string;
  creationKey: string;
  action: "ALERT" | "BUY" | "SELL";
  condition: "LTE" | "GTE";
  targetPrice: number;
  units: number | null;
  priceMode?: RequestPriceMode;
  createdAt: number;
}

const INTENT_STORAGE_PREFIX = "zarbit:request_intent:";
export const INTENT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getIntentStorageKey(userId: string): string {
  return `${INTENT_STORAGE_PREFIX}${userId}`;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // localStorage disabled or security restricted
  }
  return null;
}

export function loadCreationIntent(
  userId: string,
): RequestCreationIntent | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(getIntentStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RequestCreationIntent;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.userId !== userId ||
      typeof parsed.creationKey !== "string" ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > INTENT_EXPIRY_MS
    ) {
      storage.removeItem(getIntentStorageKey(userId));
      return null;
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(getIntentStorageKey(userId));
    } catch {
      // ignore
    }
    return null;
  }
}

export function getOrCreateCreationIntent(
  userId: string,
  payload: {
    action: "ALERT" | "BUY" | "SELL";
    condition: "LTE" | "GTE";
    targetPrice: number;
    units: number | null;
    priceMode?: RequestPriceMode;
  },
): RequestCreationIntent {
  const storage = getStorage();
  const normalizedUnits = payload.action === "ALERT" ? null : payload.units;
  const normalizedPriceMode = payload.priceMode ?? "TARGET_PRICE";
  const existing = loadCreationIntent(userId);

  if (
    existing &&
    existing.action === payload.action &&
    existing.condition === payload.condition &&
    existing.targetPrice === payload.targetPrice &&
    existing.units === normalizedUnits &&
    (existing.priceMode ?? "TARGET_PRICE") === normalizedPriceMode
  ) {
    return existing;
  }

  const intent: RequestCreationIntent = {
    userId,
    creationKey: crypto.randomUUID(),
    action: payload.action,
    condition: payload.condition,
    targetPrice: payload.targetPrice,
    units: normalizedUnits,
    priceMode: normalizedPriceMode,
    createdAt: Date.now(),
  };

  if (storage) {
    try {
      storage.setItem(getIntentStorageKey(userId), JSON.stringify(intent));
    } catch {
      // ignore storage write errors
    }
  }

  return intent;
}

export function clearCreationIntent(userId: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(getIntentStorageKey(userId));
  } catch {
    // ignore
  }
}
