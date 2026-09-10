import assert from "node:assert/strict";
import test from "node:test";

import type { LoginStatus, TelegramSessionStatus } from "@zarbit/contracts";

import { resolveTelegramSessionPresentation } from "../src/modules/telegram/_session-view-model";

function createSession(
  overrides: Partial<TelegramSessionStatus> = {},
): TelegramSessionStatus {
  return {
    connectedTelegramUserId: "10000001",
    connection: "CONNECTED",
    error: null,
    groupId: -1001234567890,
    login: null,
    membershipCheckedAt: "2026-09-07T12:00:00.000Z",
    quoteSenderId: "10000002",
    state: "ACTIVE",
    ...overrides,
  };
}

function createLogin(step: LoginStatus["step"]): LoginStatus {
  return {
    codeLength: step === "CODE" ? 5 : null,
    delivery: "app",
    expiresAt: "2026-09-07T12:05:00.000Z",
    id: "7f23a13b-9d84-4d31-8b52-fb647b92cc83",
    maskedPhone: "+989121234567",
    resendAvailableAt: "2026-09-07T12:01:00.000Z",
    step,
    error: null,
  };
}

test("maps an active connected session to manageable healthy state", () => {
  const presentation = resolveTelegramSessionPresentation(createSession());

  assert.deepEqual(presentation.chip, {
    color: "success",
    label: "دریافت مظنه فعال",
  });
  assert.equal(presentation.canManageConnection, true);
  assert.equal(presentation.canStartLogin, false);
  assert.equal(presentation.showConnectionActions, true);
});

test("keeps an offline session readable but disables connection actions", () => {
  const presentation = resolveTelegramSessionPresentation(
    createSession({ connection: "OFFLINE" }),
  );

  assert.equal(presentation.isUnavailable, true);
  assert.equal(presentation.canManageConnection, false);
  assert.equal(presentation.showConnectionActions, true);
  assert.deepEqual(presentation.chip, {
    color: "warning",
    label: "دریافت مظنه غیرفعال",
  });
});

test("maps membership loss to a dangerous but recoverable connection state", () => {
  const presentation = resolveTelegramSessionPresentation(
    createSession({ state: "NOT_IN_GROUP" }),
  );

  assert.deepEqual(presentation.chip, {
    color: "danger",
    label: "عضویت تأیید نشده",
  });
  assert.equal(presentation.canManageConnection, true);
  assert.equal(presentation.showConnectionActions, true);
});

test("keeps OTP, password, and verification challenges out of the login-start flow", () => {
  for (const step of ["CODE", "PASSWORD", "VERIFYING"] as const) {
    const presentation = resolveTelegramSessionPresentation(
      createSession({
        login: createLogin(step),
        state: "PENDING_OTP",
      }),
    );

    assert.deepEqual(presentation.chip, {
      color: "warning",
      label: "در حال ورود",
    });
    assert.equal(presentation.canStartLogin, false);
    assert.equal(presentation.showConnectionActions, false);
  }
});

test("maps revoking and error states to their explicit operational policy", () => {
  const revoking = resolveTelegramSessionPresentation(
    createSession({ state: "REVOKING" }),
  );
  const failed = resolveTelegramSessionPresentation(
    createSession({
      connectedTelegramUserId: null,
      state: "ERROR",
    }),
  );

  assert.deepEqual(revoking.chip, {
    color: "warning",
    label: "در حال قطع اتصال",
  });
  assert.equal(revoking.canManageConnection, false);
  assert.equal(failed.chip.color, "danger");
  assert.equal(failed.canStartLogin, true);
});

test("first login is available without an MTProto session but not during service failure", () => {
  for (const state of ["DISCONNECTED", "REVOKED", "ERROR"] as const) {
    const healthy = resolveTelegramSessionPresentation(
      createSession({ state, connectedTelegramUserId: null }),
    );
    assert.equal(healthy.canStartLogin, true);
    assert.notEqual(healthy.chip.label, "دریافت مظنه فعال");
    for (const connection of ["OFFLINE", "DEGRADED"] as const) {
      assert.equal(
        resolveTelegramSessionPresentation(createSession({ state, connection }))
          .canStartLogin,
        false,
      );
    }
  }
});
