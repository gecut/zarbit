import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
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

test("worker rejects unauthorized and invalid internal commands", async () => {
  const app = createWorkerApp(sessions, token, async () => ({}));

  const unauthorized = await app.request("http://worker/internal/command", {
    method: "POST",
    body: "{}",
  });
  assert.equal(unauthorized.status, 403);

  const invalid = await app.request("http://worker/internal/command", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: "{}",
  });
  assert.equal(invalid.status, 400);
});

test("worker preserves safe command failures", async () => {
  const failingSessions = {
    command: async () => {
      throw new AppError("PHONE_CODE_INVALID", "کد واردشده درست نیست.", 400);
    },
  } as Sessions;
  const app = createWorkerApp(failingSessions, token, async () => ({}));

  const response = await app.request("http://worker/internal/command", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: "user-1",
      command: { type: "status" },
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "PHONE_CODE_INVALID", message: "کد واردشده درست نیست." },
  });
});

test("worker returns the PASSWORD login state as a successful code command", async () => {
  const twoFactorSessions = {
    command: async () => ({
      state: "PENDING_OTP",
      connection: "CONNECTED",
      groupId: -1001234567890,
      quoteSenderId: "123456789",
      connectedTelegramUserId: null,
      membershipCheckedAt: null,
      error: null,
      login: {
        id: "6d94e5f1-3b0e-4c3c-a793-7182504684f2",
        step: "PASSWORD",
        expiresAt: "2026-09-06T00:10:00.000Z",
        resendAvailableAt: null,
        delivery: "app",
        codeLength: 5,
        maskedPhone: "+98••••3456",
        error: null,
      },
    }),
  } as Sessions;
  const app = createWorkerApp(twoFactorSessions, token, async () => ({}));

  const response = await app.request("http://worker/internal/command", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: "user-1",
      command: {
        type: "code",
        id: "6d94e5f1-3b0e-4c3c-a793-7182504684f2",
        code: "12345",
      },
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.login.step, "PASSWORD");
  assert.equal(body.data.login.error, null);
});
