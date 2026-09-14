import {
  presentTelegramSession,
  telegramCommandInputSchema,
  type TelegramOperation,
  type TelegramSessionFacts,
} from "@zarbit/contracts";

export function createTelegramMock(scenario: string) {
  const operations = new Map<string, TelegramOperation>();
  let facts: TelegramSessionFacts = {
    contractVersion: 3,
    authorization:
      scenario === "telegram-transitional" ? "REVOKING" : "AUTHORIZED",
    worker: scenario === "telegram-unavailable" ? "UNAVAILABLE" : "AVAILABLE",
    source: scenario === "telegram-unavailable" ? "STORED" : "LIVE",
    connection: scenario === "telegram-unavailable" ? "UNKNOWN" : "CONNECTED",
    membership: "MEMBER",
    revision: 1,
    version: 1,
    observedAt: new Date().toISOString(),
    stateChangedAt: new Date().toISOString(),
    retryAt: null,
    activeOperationId: null,
    challengeId: null,
    groupId: null,
    quoteSenderId: null,
    connectedTelegramUserId: "mock-user",
    membershipCheckedAt: new Date().toISOString(),
    login: null,
    issue:
      scenario === "telegram-unavailable"
        ? {
            code: "WORKER_UNAVAILABLE",
            message:
              "سرویس اتصال در دسترس نیست؛ وضعیت ذخیره‌شده نمایش داده می‌شود.",
          }
        : null,
  };
  return {
    status: () =>
      presentTelegramSession({
        ...facts,
        observedAt: new Date().toISOString(),
      }),
    operation: (id: string) => operations.get(id) ?? null,
    command: (input: unknown) => {
      const { command, operationId } = telegramCommandInputSchema.parse(input);
      const existing = operations.get(operationId);
      if (existing) return { operationId, acceptedAt: existing.acceptedAt };
      const acceptedAt = new Date().toISOString();
      if (command.type === "revoke" || command.type === "cancel")
        facts = {
          ...facts,
          authorization: "REVOKED",
          connectedTelegramUserId: null,
          connection: "OFFLINE",
          membership: "UNKNOWN",
          login: null,
          challengeId: null,
        };
      if (command.type === "login")
        facts = {
          ...facts,
          authorization: "LOGIN_PENDING",
          connectedTelegramUserId: null,
          membership: "UNKNOWN",
          challengeId: operationId,
          login: {
            id: operationId,
            step: "CODE",
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            resendAvailableAt: acceptedAt,
            retryAt: null,
            codeLength: 5,
            delivery: "app",
            maskedPhone: "+98••••3456",
            error: null,
          },
        };
      if (command.type === "code" && facts.login)
        facts = { ...facts, login: { ...facts.login, step: "PASSWORD" } };
      if (command.type === "password")
        facts = {
          ...facts,
          authorization: "AUTHORIZED",
          connectedTelegramUserId: "mock-user",
          membership: "MEMBER",
          connection: "CONNECTED",
          login: null,
          challengeId: null,
        };
      facts = {
        ...facts,
        version: facts.version + 1,
        stateChangedAt: acceptedAt,
      };
      operations.set(operationId, {
        operationId,
        type: command.type,
        status: "SUCCEEDED",
        revision: facts.revision,
        challengeId: "id" in command ? command.id : null,
        requestId: operationId,
        acceptedAt,
        completedAt: acceptedAt,
        issue: null,
        cancelledRequests: 0,
        sendingRequests: 0,
      });
      return { operationId, acceptedAt };
    },
  };
}
