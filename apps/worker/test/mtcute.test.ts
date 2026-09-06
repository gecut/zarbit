import assert from "node:assert/strict";
import test from "node:test";
import { observeMtcuteClient } from "../src/mtcute";
import type {
  TelegramConnectionState,
  TelegramLifecycleEvent,
} from "../src/transport";

class TestEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();
  add(listener: (value: T) => void) {
    this.listeners.add(listener);
  }
  remove(listener: (value: T) => void) {
    this.listeners.delete(listener);
  }
  emit(value: T) {
    for (const listener of this.listeners) listener(value);
  }
}

test("forwards MTcute lifecycle events and removes listeners on close", async () => {
  const states = new TestEmitter<TelegramConnectionState>();
  const errors = new TestEmitter<Error>();
  const events: TelegramLifecycleEvent[] = [];
  const stop = observeMtcuteClient(
    {
      onConnectionState: states,
      onError: errors,
      getPrimaryDcId: async () => 2,
    },
    (event) => events.push(event),
  );

  states.emit("connected");
  await new Promise((resolve) => setImmediate(resolve));
  errors.emit(Object.assign(new Error("socket reset"), { code: "ECONNRESET" }));
  stop();
  states.emit("offline");

  assert.deepEqual(events.slice(0, 2), [
    { type: "connection_state", state: "connected" },
    { type: "connection_dc", dcId: 2 },
  ]);
  assert.equal(events[2]?.type, "client_error");
  assert.equal(events.length, 3);
});
