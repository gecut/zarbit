import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerApp } from "../src/http";
import type { Sessions } from "../src/sessions";

const sessions = {} as Sessions;
const token = "a".repeat(32);

test("worker healthcheck requires a successful database query", async () => {
  const app = createWorkerApp(sessions, token, async () => ({
    databaseLatencyMs: 2,
    databasePoolTotal: 1,
  }));

  const response = await app.request("http://worker/health");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    databaseLatencyMs: 2,
    databasePoolTotal: 1,
  });
});

test("worker healthcheck fails when the database is unavailable", async () => {
  const app = createWorkerApp(sessions, token, async () => {
    throw new Error("database unavailable");
  });

  const response = await app.request("http://worker/health");

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false });
});
