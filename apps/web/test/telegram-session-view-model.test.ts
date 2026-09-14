import assert from "node:assert/strict";
import test from "node:test";
import { sessionFixture, loginFixture, fixtureTime } from "./telegram-fixture";
import {
  presentTelegramSession,
  telegramSessionStatusSchema,
} from "@zarbit/contracts";
import { resolveTelegramSessionPresentation as present } from "../src/modules/telegram/_session-view-model";

test("ready requires authorization, live transport, and membership", () => {
  assert.equal(present(sessionFixture()).chip.color, "success");
  for (const change of [
    { connection: "OFFLINE" },
    { membership: "NOT_MEMBER" },
    { worker: "UNAVAILABLE", source: "STORED", connection: "UNKNOWN" },
  ] as const) {
    const s = sessionFixture(change);
    assert.notEqual(present(s).chip.color, "success");
    assert.equal(s.capabilities.canCreateRequest, false);
    assert.equal(s.capabilities.canRevoke, true);
    assert.equal(s.capabilities.canLogin, false);
  }
});
test("first login and re-login are independent of MTProto connection", () => {
  for (const authorization of ["DISCONNECTED", "REVOKED", "ERROR"] as const) {
    const s = sessionFixture({
      authorization,
      connectedTelegramUserId: null,
      connection: "OFFLINE",
      membership: "UNKNOWN",
    });
    assert.equal(present(s).canStartLogin, true);
    assert.equal(s.capabilities.canCheckMembership, false);
    assert.equal(s.capabilities.canRevoke, false);
    assert.equal(
      sessionFixture({ ...s, worker: "UNAVAILABLE", source: "STORED" })
        .capabilities.canLogin,
      false,
    );
  }
});
test("each challenge phase grants only its own credential action and keeps cancellation", () => {
  for (const step of [
    "SENDING_CODE",
    "CODE",
    "VERIFYING_CODE",
    "PASSWORD",
    "VERIFYING_PASSWORD",
  ] as const) {
    const s = sessionFixture({
      authorization: "LOGIN_PENDING",
      connectedTelegramUserId: null,
      membership: "UNKNOWN",
      login: loginFixture(step),
    });
    assert.equal(s.capabilities.canSubmitCode, step === "CODE");
    assert.equal(s.capabilities.canSubmitPassword, step === "PASSWORD");
    assert.equal(s.capabilities.canResend, step === "CODE");
    assert.equal(s.capabilities.canCancelLogin, true);
    assert.equal(s.capabilities.canLogin, false);
    assert.equal(present(s).showConnectionActions, false);
    const blocked = sessionFixture({
      ...s,
      login: {
        ...s.login!,
        retryAt: new Date(fixtureTime + 60000).toISOString(),
      },
    });
    assert.equal(blocked.capabilities.canSubmitCode, false);
    assert.equal(blocked.capabilities.canSubmitPassword, false);
    assert.equal(blocked.capabilities.canResend, false);
    assert.equal(blocked.capabilities.canCancelLogin, true);
  }
});
test("schema rejects invalid authorization/challenge combinations", () => {
  assert.throws(() =>
    sessionFixture({
      authorization: "AUTHORIZED",
      connectedTelegramUserId: null,
    }),
  );
  assert.throws(() => sessionFixture({ login: loginFixture("CODE") }));
  assert.throws(() =>
    sessionFixture({ authorization: "LOGIN_PENDING", login: null }),
  );
  assert.equal(
    telegramSessionStatusSchema.safeParse({ state: "ACTIVE" }).success,
    false,
  );
  const s = sessionFixture({ authorization: "REVOKING" });
  assert.equal(Object.values(s.capabilities).some(Boolean), false);
  const { capabilities: _, ...facts } = sessionFixture({
    authorization: "LOGIN_PENDING",
    login: loginFixture("CODE"),
  });
  assert.equal(
    presentTelegramSession(facts, fixtureTime + 600001).capabilities
      .canSubmitCode,
    false,
  );
});
