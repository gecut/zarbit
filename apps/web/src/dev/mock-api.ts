import {
  AppError,
  workerCommandSchema,
  telegramSessionStatusSchema,
  createRequestInputSchema,
  updateRequestInputSchema,
  type Identity,
  type TelegramSessionStatusV2,
  type WorkerCommand,
  type RequestDetail,
  type CreateRequestInput,
} from "@zarbit/contracts";

import type { LegacyApi } from "../shared/api/legacy-api";
import { createQuoteDashboard, getQuoteScenario } from "./quote-scenarios";

export const mockIdentity: Identity = {
  telegramUserId: "10000001",
  firstName: "کاربر توسعه",
  username: "zarbit_dev",
};

export type SessionScenario =
  | "active"
  | "disconnected"
  | "login_pending"
  | "not_in_group"
  | "degraded"
  | "revoked"
  | "error";

export function getSessionScenario(search: string): SessionScenario {
  const value = new URLSearchParams(search).get("sessionScenario");
  return [
    "disconnected",
    "login_pending",
    "not_in_group",
    "degraded",
    "revoked",
    "error",
  ].includes(value ?? "")
    ? (value as SessionScenario)
    : "active";
}

function initialSession(now = Date.now()): TelegramSessionStatusV2 {
  return {
    kind: "ACTIVE",
    state: "ACTIVE",
    connection: "CONNECTED",
    reasonCode: "NONE",
    observedAt: new Date(now).toISOString(),
    stateChangedAt: new Date(now).toISOString(),
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
    membershipCheckedAt: new Date(now).toISOString(),
    error: null,
    login: null,
  };
}

export function createSessionFromScenario(
  scenario: SessionScenario,
  now = Date.now(),
): TelegramSessionStatusV2 {
  switch (scenario) {
    case "disconnected":
      return {
        kind: "DISCONNECTED",
        state: "DISCONNECTED",
        connection: "OFFLINE",
        reasonCode: "LOGIN_REQUIRED",
        observedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
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
    case "login_pending":
      return {
        kind: "LOGIN_PENDING",
        state: "LOGIN_PENDING",
        connection: "CONNECTING",
        reasonCode: "NONE",
        observedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
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
          id: "7f23a13b-9d84-4d31-8b52-fb647b92cc83",
          step: "CODE",
          expiresAt: new Date(now + 5 * 60_000).toISOString(),
          resendAvailableAt: new Date(now + 30_000).toISOString(),
          delivery: "app",
          codeLength: 5,
          maskedPhone: "+98912•••••12",
          error: null,
        },
        phase: "CODE",
      };
    case "not_in_group":
      return {
        kind: "NOT_IN_GROUP",
        state: "NOT_IN_GROUP",
        connection: "CONNECTED",
        reasonCode: "GROUP_MEMBERSHIP_REQUIRED",
        observedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
        retryAt: null,
        capabilities: {
          canLogin: false,
          canCreateRequest: false,
          canCheckMembership: true,
          canRevoke: true,
        },
        groupId: -1001234567890,
        quoteSenderId: "123456789",
        connectedTelegramUserId: mockIdentity.telegramUserId,
        membershipCheckedAt: new Date(now - 10 * 60_000).toISOString(),
        error: null,
        login: null,
      };
    case "degraded":
      return {
        kind: "DEGRADED",
        state: "DEGRADED",
        connection: "OFFLINE",
        reasonCode: "WORKER_UNAVAILABLE",
        observedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
        retryAt: new Date(now + 30_000).toISOString(),
        capabilities: {
          canLogin: false,
          canCreateRequest: false,
          canCheckMembership: false,
          canRevoke: false,
        },
        groupId: -1001234567890,
        quoteSenderId: "123456789",
        connectedTelegramUserId: mockIdentity.telegramUserId,
        membershipCheckedAt: new Date(now).toISOString(),
        error: "ارتباط با کارگزار تلگرام قطع شده است.",
        login: null,
      };
    case "revoked":
      return {
        kind: "REVOKED",
        state: "REVOKED",
        connection: "OFFLINE",
        reasonCode: "TELEGRAM_LOGGED_OUT",
        observedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
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
    case "error":
      return {
        kind: "ERROR",
        state: "ERROR",
        connection: "OFFLINE",
        reasonCode: "UNKNOWN_FAILURE",
        observedAt: new Date(now).toISOString(),
        stateChangedAt: new Date(now).toISOString(),
        retryAt: new Date(now + 60_000).toISOString(),
        capabilities: {
          canLogin: true,
          canCreateRequest: false,
          canCheckMembership: false,
          canRevoke: true,
        },
        groupId: -1001234567890,
        quoteSenderId: "123456789",
        connectedTelegramUserId: null,
        membershipCheckedAt: null,
        error: "خطای ناشناخته در اتصال به تلگرام رخ داده است.",
        login: null,
      };
    case "active":
    default:
      return initialSession(now);
  }
}

function getSearch(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}

function copySession(
  session: TelegramSessionStatusV2,
): TelegramSessionStatusV2 {
  return telegramSessionStatusSchema.parse({
    ...session,
    login: session.login ? { ...session.login } : null,
  });
}

function seedRequests(search = ""): RequestDetail[] {
  const value = new URLSearchParams(search).get("requestsScenario");
  if (value === "empty") return [];

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
  const initialSearch = getSearch();
  let session = createSessionFromScenario(getSessionScenario(initialSearch));
  const requests: RequestDetail[] = seedRequests(initialSearch);

  const completeLogin = () => {
    session = initialSession();
  };

  const forceSend = async (id: string): Promise<RequestDetail> => {
    const row = requests.find((r) => r.id === id);
    if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
    if (row.status !== "ACTIVE") {
      throw new AppError(
        "REQUEST_CONFLICT",
        "وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید.",
        409,
      );
    }
    const nowIso = new Date().toISOString();
    row.status = "DONE";
    row.executionPhase = "DONE";
    row.outgoingMessageId = Math.floor(Math.random() * 9000) + 1000;
    row.deliveryStartedAt = nowIso;
    row.completedAt = nowIso;
    row.updatedAt = nowIso;
    return structuredClone(row);
  };

  return {
    authenticate: async () => ({ ...mockIdentity }),
    getQuoteDashboard: async () => {
      const scenario = getQuoteScenario(getSearch());
      if (scenario === "loading")
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      if (scenario === "error")
        throw new AppError("MOCK_ERROR", "خطای آزمایشی دریافت مظنه.", 503);
      const dashboard = createQuoteDashboard(scenario, Date.now());
      return {
        latest: dashboard.latest ? { ...dashboard.latest } : null,
        latestTrade: dashboard.latestTrade
          ? { ...dashboard.latestTrade }
          : null,
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
          observedAt: new Date(now).toISOString(),
          stateChangedAt: new Date(now).toISOString(),
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
      } else if (input.type === "code") {
        if (!session.login || session.login.id !== input.id)
          throw new AppError("INVALID_LOGIN", "ورود معتبر نیست.", 400);
        if (input.code === "00000") {
          throw new AppError("INVALID_CODE", "کد ورود نامعتبر است.", 400);
        }
        if (input.code === "22222") {
          session = {
            ...session,
            login: {
              ...session.login,
              step: "PASSWORD",
              error: null,
            },
            phase: "PASSWORD",
          };
          return copySession(session);
        }
        completeLogin();
      } else if (input.type === "password") {
        if (!session.login || session.login.id !== input.id)
          throw new AppError("INVALID_LOGIN", "ورود معتبر نیست.", 400);
        if (input.password === "wrong") {
          throw new AppError(
            "INVALID_PASSWORD",
            "رمز عبور دو مرحله‌ای نامعتبر است.",
            400,
          );
        }
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
        session = createSessionFromScenario("disconnected");
      } else if (input.type === "membership") {
        const nowIso = new Date().toISOString();
        if (session.kind === "NOT_IN_GROUP") {
          session = {
            ...initialSession(),
            membershipCheckedAt: nowIso,
          };
        } else {
          session = { ...session, membershipCheckedAt: nowIso };
        }
      } else if (input.type === "revoke") {
        session = createSessionFromScenario("revoked");
      } else if (input.type === "force-send") {
        await forceSend(input.id);
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
      const data = createRequestInputSchema.parse(input);
      const nowIso = new Date().toISOString();
      const row: RequestDetail = {
        ...data,
        units: data.action === "ALERT" ? null : data.units,
        id: crypto.randomUUID(),
        status: "ACTIVE",
        executionPhase: "WAITING_QUOTE",
        outcomeCode: null,
        deliveryStartedAt: null,
        unknownReason: null,
        resolutionState: "NOT_APPLICABLE",
        executing: false,
        triggeredQuote: null,
        triggeredMessageId: null,
        outgoingMessageId: null,
        completedAt: null,
        failureReason: null,
        cancellationReason: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      requests.unshift(row);
      return structuredClone(row);
    },
    updateRequest: async (id, input) => {
      const row = requests.find((r) => r.id === id);
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      if (row.status !== "ACTIVE") {
        throw new AppError(
          "REQUEST_CONFLICT",
          "وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید.",
          409,
        );
      }
      const data = updateRequestInputSchema.parse(input);
      Object.assign(row, {
        ...data,
        units: data.action === "ALERT" ? null : data.units,
        updatedAt: new Date().toISOString(),
      });
      return structuredClone(row);
    },
    cancelRequest: async (id) => {
      const row = requests.find((r) => r.id === id);
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      if (row.status !== "ACTIVE") {
        throw new AppError(
          "REQUEST_CONFLICT",
          "وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید.",
          409,
        );
      }
      const nowIso = new Date().toISOString();
      row.status = "CANCELLED";
      row.executionPhase = "CANCELLED";
      row.cancellationReason = "لغو توسط کاربر";
      row.completedAt = nowIso;
      row.updatedAt = nowIso;
      return structuredClone(row);
    },
    forceSendRequest: async (id) => {
      return forceSend(id);
    },
  };
}
