import {
  AppError,
  workerCommandSchema,
  type Identity,
  type TelegramSessionStatus,
  type WorkerCommand,
} from "@zarbit/contracts";

import type { ApiClient } from "../lib/api";
import { createQuoteDashboard, getQuoteScenario } from "./quote-scenarios";

const mockIdentity: Identity = {
  telegramUserId: "10000001",
  firstName: "کاربر توسعه",
  username: "zarbit_dev",
};

function initialSession(): TelegramSessionStatus {
  return {
    state: "ACTIVE",
    connection: "CONNECTED",
    groupId: -1001234567890,
    quoteSenderId: "123456789",
    connectedTelegramUserId: mockIdentity.telegramUserId,
    membershipCheckedAt: new Date().toISOString(),
    error: null,
    login: null,
  };
}

function copySession(session: TelegramSessionStatus): TelegramSessionStatus {
  return { ...session, login: session.login ? { ...session.login } : null };
}

export function createMockApi(): ApiClient {
  let session = initialSession();
  const scenario = getQuoteScenario(window.location.search);
  const dashboard = createQuoteDashboard(scenario);

  const completeLogin = () => {
    session = initialSession();
  };

  return {
    authenticate: async () => ({ ...mockIdentity }),
    getLatestQuote: async () =>
      dashboard.latest ? { ...dashboard.latest } : null,
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
          state: "PENDING_OTP",
          connection: "CONNECTING",
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
          state: "DISCONNECTED",
          connection: "OFFLINE",
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
          state: "REVOKED",
          connection: "OFFLINE",
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
  };
}
