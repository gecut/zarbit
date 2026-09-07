import {
  AppError,
  workerCommandSchema,
  type Identity,
  type LatestQuote,
  type TelegramSessionStatus,
  type WorkerCommand,
} from "@zarbit/contracts";

import type { ApiClient } from "../lib/api";

const mockIdentity: Identity = {
  telegramUserId: "10000001",
  firstName: "کاربر توسعه",
  username: "zarbit_dev",
};

function initialSession(): TelegramSessionStatus {
  return {
    state: "ACTIVE",
    connection: "CONNECTED",
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
  const latestQuote: LatestQuote = {
    quote: 95_900_000,
    announcedAt: new Date().toISOString(),
  };

  const completeLogin = () => {
    session = initialSession();
  };

  return {
    authenticate: async () => ({ ...mockIdentity }),
    getLatestQuote: async () => ({ ...latestQuote }),
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
