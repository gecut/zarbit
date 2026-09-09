import {
  AppError,
  workerCommandSchema,
  telegramSessionStatusSchema,
  type Identity,
  type TelegramSessionStatusV2,
  type WorkerCommand,
  type RequestDetail,
  type CreateRequestInput,
} from "@zarbit/contracts";

import type { LegacyApi } from "../shared/api/legacy-api";
import { createQuoteDashboard, getQuoteScenario } from "./quote-scenarios";

const mockIdentity: Identity = {
  telegramUserId: "10000001",
  firstName: "کاربر توسعه",
  username: "zarbit_dev",
};

function initialSession(): TelegramSessionStatusV2 {
  return {
    kind: "ACTIVE",
    state: "ACTIVE",
    connection: "CONNECTED",
    reasonCode: "NONE",
    observedAt: new Date().toISOString(),
    stateChangedAt: new Date().toISOString(),
    retryAt: null,
    capabilities: {
      canLogin: false,
      canCreateRequest: true,
      canCheckMembership: true,
      canRevoke: true,
    },
    groupId: -1001234567890,
    quoteSenderId: "123456789",
    connectedTelegramUserId: mockIdentity.telegramUserId,
    membershipCheckedAt: new Date().toISOString(),
    error: null,
    login: null,
  };
}

function copySession(
  session: TelegramSessionStatusV2,
): TelegramSessionStatusV2 {
  return telegramSessionStatusSchema.parse({
    ...session,
    login: session.login ? { ...session.login } : null,
  });
}

function seedRequests(): RequestDetail[] {
  const now = Date.now();
  const make = (
    input: CreateRequestInput,
    status: RequestDetail["status"],
    extra: Partial<RequestDetail> = {},
  ): RequestDetail => ({
    ...input,
    id: crypto.randomUUID(),
    status,
    executionPhase: status === "ACTIVE" ? "WAITING_QUOTE" : status,
    outcomeCode: status === "FAILED" ? "DELIVERY_FAILED" : null,
    deliveryStartedAt:
      status === "DONE" || status === "UNKNOWN"
        ? new Date(now - 14 * 60_000).toISOString()
        : null,
    unknownReason:
      status === "UNKNOWN" ? "نتیجه تحویل از تلگرام مشخص نیست." : null,
    resolutionState: status === "UNKNOWN" ? "UNRESOLVED" : "NOT_APPLICABLE",
    executing: status === "ACTIVE" && input.action === "BUY",
    triggeredQuote: status === "ACTIVE" ? null : input.targetPrice + 120,
    triggeredMessageId: status === "ACTIVE" ? null : 1842,
    outgoingMessageId: status === "DONE" ? 9901 : null,
    completedAt:
      status === "ACTIVE" ? null : new Date(now - 15 * 60_000).toISOString(),
    failureReason:
      status === "FAILED"
        ? "ارسال انجام نشد؛ اتصال و مجوز ارسال را بررسی کنید."
        : status === "UNKNOWN"
          ? "نتیجه ارسال مشخص نیست؛ گروه را بررسی کنید."
          : null,
    cancellationReason: status === "CANCELLED" ? "لغو توسط کاربر" : null,
    createdAt: new Date(now - 30 * 60_000).toISOString(),
    updatedAt: new Date(now - 5 * 60_000).toISOString(),
    ...extra,
  });
  return [
    make(
      { action: "ALERT", condition: "GTE", targetPrice: 96_000, units: null },
      "ACTIVE",
    ),
    make(
      { action: "BUY", condition: "LTE", targetPrice: 95_500, units: 2 },
      "ACTIVE",
    ),
    make(
      { action: "SELL", condition: "GTE", targetPrice: 97_200, units: 5 },
      "DONE",
    ),
    make(
      { action: "ALERT", condition: "LTE", targetPrice: 94_800, units: null },
      "CANCELLED",
    ),
    make(
      { action: "BUY", condition: "LTE", targetPrice: 93_000, units: 10 },
      "FAILED",
    ),
    make(
      { action: "SELL", condition: "GTE", targetPrice: 98_000, units: 3 },
      "UNKNOWN",
    ),
  ];
}

export function createMockApi(): LegacyApi {
  let session = initialSession();
  const requests: RequestDetail[] = seedRequests();
  const scenario = getQuoteScenario(window.location.search);
  const dashboard = createQuoteDashboard(scenario);

  const completeLogin = () => {
    session = initialSession();
  };

  return {
    authenticate: async () => ({ ...mockIdentity }),
    getQuoteDashboard: async () => {
      if (scenario === "loading")
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      if (scenario === "error")
        throw new AppError("MOCK_ERROR", "خطای آزمایشی دریافت مظنه.", 503);
      return {
        latest: dashboard.latest ? { ...dashboard.latest } : null,
        points: dashboard.points.map((point) => ({ ...point })),
      };
    },
    getTelegramSession: async () => copySession(session),
    sessionCommand: async (command) => {
      const parsed = workerCommandSchema.safeParse(command);
      if (!parsed.success || parsed.data.type === "status")
        throw new AppError("INVALID_LOGIN", "اطلاعات ورود را بررسی کنید.", 400);

      const input: Exclude<WorkerCommand, { type: "status" }> = parsed.data;
      if (input.type === "login") {
        const now = Date.now();
        session = {
          kind: "LOGIN_PENDING",
          state: "LOGIN_PENDING",
          connection: "CONNECTING",
          reasonCode: "NONE",
          observedAt: new Date().toISOString(),
          stateChangedAt: new Date().toISOString(),
          retryAt: null,
          capabilities: {
            canLogin: false,
            canCreateRequest: false,
            canCheckMembership: false,
            canRevoke: false,
          },
          groupId: -1001234567890,
          quoteSenderId: "123456789",
          connectedTelegramUserId: null,
          membershipCheckedAt: null,
          error: null,
          login: {
            id: crypto.randomUUID(),
            step: "CODE",
            expiresAt: new Date(now + 5 * 60_000).toISOString(),
            resendAvailableAt: new Date(now + 30_000).toISOString(),
            delivery: "app",
            codeLength: 5,
            maskedPhone: input.phone.replace(/.(?=.{4})/g, "•"),
            error: null,
          },
          phase: "CODE",
        };
      } else if (input.type === "code" || input.type === "password") {
        if (!session.login || session.login.id !== input.id)
          throw new AppError("INVALID_LOGIN", "ورود معتبر نیست.", 400);
        completeLogin();
      } else if (input.type === "resend") {
        if (!session.login || session.login.id !== input.id)
          throw new AppError("INVALID_LOGIN", "ورود معتبر نیست.", 400);
        session = {
          ...session,
          login: {
            ...session.login,
            resendAvailableAt: new Date(Date.now() + 30_000).toISOString(),
          },
        };
      } else if (input.type === "cancel") {
        if (!session.login || session.login.id !== input.id)
          throw new AppError("INVALID_LOGIN", "ورود معتبر نیست.", 400);
        session = {
          kind: "DISCONNECTED",
          state: "DISCONNECTED",
          connection: "OFFLINE",
          reasonCode: "LOGIN_REQUIRED",
          observedAt: new Date().toISOString(),
          stateChangedAt: new Date().toISOString(),
          retryAt: null,
          capabilities: {
            canLogin: true,
            canCreateRequest: false,
            canCheckMembership: false,
            canRevoke: false,
          },
          groupId: -1001234567890,
          quoteSenderId: "123456789",
          connectedTelegramUserId: null,
          membershipCheckedAt: null,
          error: null,
          login: null,
        };
      } else if (input.type === "membership") {
        session = { ...session, membershipCheckedAt: new Date().toISOString() };
      } else if (input.type === "revoke") {
        session = {
          kind: "REVOKED",
          state: "REVOKED",
          connection: "OFFLINE",
          reasonCode: "TELEGRAM_LOGGED_OUT",
          observedAt: new Date().toISOString(),
          stateChangedAt: new Date().toISOString(),
          retryAt: null,
          capabilities: {
            canLogin: true,
            canCreateRequest: false,
            canCheckMembership: false,
            canRevoke: false,
          },
          groupId: -1001234567890,
          quoteSenderId: "123456789",
          connectedTelegramUserId: null,
          membershipCheckedAt: null,
          error: null,
          login: null,
        };
      }

      return copySession(session);
    },
    getRequest: async (id) => {
      const row = requests.find((row) => row.id === id);
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      return structuredClone(row);
    },
    getActiveRequests: async () =>
      structuredClone(requests.filter((r) => r.status === "ACTIVE")),
    getRequestHistory: async () => ({
      items: structuredClone(requests.filter((r) => r.status !== "ACTIVE")),
      nextCursor: null,
    }),
    createRequest: async (input) => {
      const now = new Date().toISOString();
      const row = {
        ...input,
        id: crypto.randomUUID(),
        status: "ACTIVE" as const,
        executionPhase: "WAITING_QUOTE" as const,
        outcomeCode: null,
        deliveryStartedAt: null,
        unknownReason: null,
        resolutionState: "NOT_APPLICABLE" as const,
        executing: false,
        triggeredQuote: null,
        triggeredMessageId: null,
        outgoingMessageId: null,
        completedAt: null,
        failureReason: null,
        cancellationReason: null,
        createdAt: now,
        updatedAt: now,
      };
      requests.unshift(row);
      return structuredClone(row);
    },
    updateRequest: async (id, input) => {
      const row = requests.find((r) => r.id === id);
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      Object.assign(row, input);
      return structuredClone(row);
    },
    cancelRequest: async (id) => {
      const row = requests.find((r) => r.id === id);
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      row.status = "CANCELLED";
      row.cancellationReason = "لغو توسط کاربر";
      row.completedAt = new Date().toISOString();
      return structuredClone(row);
    },
    forceSendRequest: async (id) => {
      const row = requests.find((r) => r.id === id);
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      row.status = "DONE";
      row.outgoingMessageId = 1;
      row.completedAt = new Date().toISOString();
      return structuredClone(row);
    },
  };
}
