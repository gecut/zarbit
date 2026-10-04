import assert from "node:assert/strict";
import test from "node:test";
import {
  clearCreationIntent,
  getIntentStorageKey,
  getOrCreateCreationIntent,
  loadCreationIntent,
  INTENT_EXPIRY_MS,
} from "../src/modules/requests/_request-creation-intent";

function setupMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    length: 0,
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: mockStorage,
    },
  });
  return store;
}

test("getIntentStorageKey isolates intent keys by user id", () => {
  assert.equal(getIntentStorageKey("user-1"), "zarbit:request_intent:user-1");
  assert.equal(getIntentStorageKey("user-2"), "zarbit:request_intent:user-2");
});

test("getOrCreateCreationIntent generates a valid UUID and stores intent", () => {
  const store = setupMockLocalStorage();
  const payload = {
    action: "ALERT" as const,
    condition: "LTE" as const,
    targetPrice: 96_000,
    units: null,
  };

  const intent = getOrCreateCreationIntent("user-1", payload);
  assert.equal(intent.userId, "user-1");
  assert.equal(typeof intent.creationKey, "string");
  assert.match(
    intent.creationKey,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  assert.equal(store.has("zarbit:request_intent:user-1"), true);
});

test("getOrCreateCreationIntent reuses creationKey for identical retry payload", () => {
  setupMockLocalStorage();
  const payload = {
    action: "BUY" as const,
    condition: "GTE" as const,
    targetPrice: 105_000,
    units: 2,
  };

  const firstIntent = getOrCreateCreationIntent("user-1", payload);
  const secondIntent = getOrCreateCreationIntent("user-1", payload);

  assert.equal(secondIntent.creationKey, firstIntent.creationKey);
  assert.equal(secondIntent.createdAt, firstIntent.createdAt);
});

test("getOrCreateCreationIntent creates new key if payload changes", () => {
  setupMockLocalStorage();
  const originalPayload = {
    action: "BUY" as const,
    condition: "GTE" as const,
    targetPrice: 105_000,
    units: 2,
  };

  const firstIntent = getOrCreateCreationIntent("user-1", originalPayload);
  const modifiedIntent = getOrCreateCreationIntent("user-1", {
    ...originalPayload,
    targetPrice: 106_000,
  });

  assert.notEqual(modifiedIntent.creationKey, firstIntent.creationKey);
});

test("loadCreationIntent removes expired intents and returns null", () => {
  const store = setupMockLocalStorage();
  const expiredIntent = {
    userId: "user-1",
    creationKey: "11111111-2222-3333-4444-555555555555",
    action: "ALERT",
    condition: "LTE",
    targetPrice: 96_000,
    units: null,
    createdAt: Date.now() - (INTENT_EXPIRY_MS + 10_000),
  };
  store.set("zarbit:request_intent:user-1", JSON.stringify(expiredIntent));

  const loaded = loadCreationIntent("user-1");
  assert.equal(loaded, null);
  assert.equal(store.has("zarbit:request_intent:user-1"), false);
});

test("clearCreationIntent removes intent from storage", () => {
  const store = setupMockLocalStorage();
  getOrCreateCreationIntent("user-1", {
    action: "ALERT",
    condition: "LTE",
    targetPrice: 96_000,
    units: null,
  });
  assert.equal(store.has("zarbit:request_intent:user-1"), true);

  clearCreationIntent("user-1");
  assert.equal(store.has("zarbit:request_intent:user-1"), false);
});

test("loadCreationIntent handles corrupted JSON safely", () => {
  const store = setupMockLocalStorage();
  store.set("zarbit:request_intent:user-1", "invalid-json{");

  const loaded = loadCreationIntent("user-1");
  assert.equal(loaded, null);
  assert.equal(store.has("zarbit:request_intent:user-1"), false);
});
