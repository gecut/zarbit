import {
  AppError,
  requestInputSchema,
  workerCommandSchema,
  type Identity,
  type RequestPayload,
  type TelegramSessionStatus,
  type WorkerCommand,
  type ZarbitRequest,
} from "@zarbit/contracts";

import type { ApiClient } from "../lib/api";
import { createMockRequests } from "./mock-scenarios";

const mockIdentity: Identity = {
  telegramUserId: "10000001",
  firstName: "کاربر توسعه",
  username: "zarbit_dev",
};
const pageSize = 20;

function initialSession(): TelegramSessionStatus {
  return {
    state: "ACTIVE",
    connection: "CONNECTED",
    connectedTelegramUserId: mockIdentity.telegramUserId,
    membershipCheckedAt: new Date().toISOString(),
    canManageRequests: true,
    error: null,
    login: null,
  };
}

function copyRequest(request: ZarbitRequest): ZarbitRequest {
  return { ...request };
}

function copySession(session: TelegramSessionStatus): TelegramSessionStatus {
  return { ...session, login: session.login ? { ...session.login } : null };
}

function requestInput(input: RequestPayload): RequestPayload {
  const parsed = requestInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new AppError(
    "INVALID_REQUEST",
    parsed.error.issues.find((issue) => /[\u0600-\u06ff]/.test(issue.message))
      ?.message ?? "قیمت، تعداد و اطلاعات درخواست را بررسی کنید.",
    400,
  );
}

function ensureReady(session: TelegramSessionStatus) {
  if (session.canManageRequests) return;
  throw new AppError(
    "SESSION_NOT_READY",
    session.error ?? "اتصال تلگرام هنوز آماده نیست.",
  );
}

/**
 * A development-only, in-memory implementation of the web API contract.
 * Its state belongs to the provider-created client, so each app mount is isolated.
 */
export function createMockApi(): ApiClient {
  let requests = createMockRequests();
  let session = initialSession();

  const findRequest = (id: string): ZarbitRequest => {
    const request = requests.find((item) => item.id === id);
    if (request) return request;
    throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
  };

  const completeLogin = () => {
    session = {
      ...initialSession(),
      membershipCheckedAt: new Date().toISOString(),
    };
  };

  return {
    authenticate: async () => ({ ...mockIdentity }),
    getRequests: async (status, page = 1) => {
      const filtered = requests.filter((request) =>
        status === "HISTORY"
          ? request.status !== "ACTIVE"
          : status
            ? request.status === status
            : true,
      );
      const ordered = [...filtered].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      );
      return {
        items: ordered
          .slice((page - 1) * pageSize, page * pageSize)
          .map(copyRequest),
        total: ordered.length,
        page,
        pageSize,
        activeCount: requests.filter((request) => request.status === "ACTIVE")
          .length,
      };
    },
    getRequest: async (id) => copyRequest(findRequest(id)),
    createRequest: async (payload) => {
      ensureReady(session);
      const input = requestInput(payload);
      const now = new Date().toISOString();
      const request: ZarbitRequest = {
        id: crypto.randomUUID(),
        ...input,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        triggeredQuote: null,
        completedAt: null,
        failureReason: null,
        cancellationReason: null,
        isExecuting: false,
      };
      requests = [request, ...requests];
      return copyRequest(request);
    },
    updateRequest: async (id, payload) => {
      ensureReady(session);
      const request = findRequest(id);
      if (request.status !== "ACTIVE" || request.isExecuting)
        throw new AppError(
          "REQUEST_LOCKED",
          "درخواست اجرا شده یا در حال اجراست؛ قابل ویرایش نیست.",
        );
      const input = requestInput(payload);
      const updated = {
        ...request,
        ...input,
        updatedAt: new Date().toISOString(),
      };
      requests = requests.map((item) => (item.id === id ? updated : item));
      return copyRequest(updated);
    },
    cancelRequest: async (id) => {
      const request = findRequest(id);
      if (request.status !== "ACTIVE" || request.isExecuting)
        throw new AppError(
          "REQUEST_LOCKED",
          "فقط درخواست اجرا‌نشده قابل لغو است.",
        );
      const now = new Date().toISOString();
      requests = requests.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "CANCELLED",
              updatedAt: now,
              completedAt: now,
              cancellationReason: "کاربر درخواست را لغو کرد.",
            }
          : item,
      );
      return { cancelled: true };
    },
    getTelegramSession: async () => copySession(session),
    sessionCommand: async (command) => {
      const parsed = workerCommandSchema.safeParse(command);
      if (!parsed.success)
        throw new AppError("INVALID_LOGIN", "اطلاعات ورود را بررسی کنید.", 400);

      if (parsed.data.type === "status")
        throw new AppError("INVALID_LOGIN", "اطلاعات ورود را بررسی کنید.", 400);

      const input: Exclude<WorkerCommand, { type: "status" }> = parsed.data;
      if (input.type === "login") {
        const now = Date.now();
        session = {
          state: "PENDING_OTP",
          connection: "CONNECTING",
          connectedTelegramUserId: null,
          membershipCheckedAt: null,
          canManageRequests: false,
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
          canManageRequests: false,
          error: null,
          login: null,
        };
      } else if (input.type === "membership") {
        session = {
          ...session,
          membershipCheckedAt: new Date().toISOString(),
        };
      } else if (input.type === "revoke") {
        const now = new Date().toISOString();
        requests = requests.map((request) =>
          request.status === "ACTIVE" && !request.isExecuting
            ? {
                ...request,
                status: "CANCELLED",
                updatedAt: now,
                completedAt: now,
                cancellationReason:
                  "قطع اتصال درخواست شده؛ درخواست‌های اجرا‌نشده لغو شدند.",
              }
            : request,
        );
        session = {
          state: "REVOKED",
          connection: "OFFLINE",
          connectedTelegramUserId: null,
          membershipCheckedAt: null,
          canManageRequests: false,
          error: null,
          login: null,
        };
      }

      return copySession(session);
    },
  };
}
