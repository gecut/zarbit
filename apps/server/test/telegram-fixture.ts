import {
  presentTelegramSession,
  type TelegramSessionFacts,
  type LoginStatus,
} from "@zarbit/contracts";
export const fixtureTime = Date.parse("2026-09-14T12:00:00.000Z");
export function sessionFixture(overrides: Partial<TelegramSessionFacts> = {}) {
  return presentTelegramSession(
    {
      contractVersion: 3,
      authorization: "AUTHORIZED",
      worker: "AVAILABLE",
      connection: "CONNECTED",
      membership: "MEMBER",
      source: "LIVE",
      revision: 1,
      version: 1,
      observedAt: new Date(fixtureTime).toISOString(),
      stateChangedAt: new Date(fixtureTime).toISOString(),
      retryAt: null,
      activeOperationId: null,
      challengeId: null,
      groupId: -1001234567890,
      quoteSenderId: "123456789",
      connectedTelegramUserId: "123456",
      membershipCheckedAt: new Date(fixtureTime).toISOString(),
      login: null,
      issue: null,
      ...overrides,
    },
    fixtureTime,
  );
}
export function loginFixture(step: LoginStatus["step"]): LoginStatus {
  return {
    id: "7f23a13b-9d84-4d31-8b52-fb647b92cc83",
    step,
    expiresAt: new Date(fixtureTime + 600000).toISOString(),
    resendAvailableAt: new Date(fixtureTime).toISOString(),
    retryAt: null,
    codeLength: 5,
    delivery: "app",
    maskedPhone: "+98••••3456",
    error: null,
  };
}
