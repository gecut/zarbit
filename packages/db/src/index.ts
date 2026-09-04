import { randomUUID } from "node:crypto";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { env } from "@zarbit/env/server";

import {
  PrismaClient,
  RequestStatus,
  TelegramSessionState,
} from "../prisma/generated/client";

export type RequestAction = "ALERT" | "BUY" | "SELL";
export type RequestCondition = "LTE" | "GTE";

export interface RequestInput {
  condition: RequestCondition;
  targetPrice: number;
  action: RequestAction;
  units: number | null;
}

function assertRequestInput(input: RequestInput): void {
  if (!Number.isSafeInteger(input.targetPrice) || input.targetPrice <= 0) {
    throw new Error("Target price must be a positive integer.");
  }

  if (input.action === "ALERT" && input.units !== null) {
    throw new Error("Alert requests cannot include units.");
  }

  if (
    input.action !== "ALERT" &&
    (!Number.isSafeInteger(input.units) || input.units === null || input.units <= 0)
  ) {
    throw new Error("Trade requests require positive units.");
  }
}

export function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

export async function upsertTelegramUser(input: {
  telegramUserId: string;
  firstName?: string;
  username?: string;
}) {
  return prisma.telegramUser.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: input,
    update: { firstName: input.firstName, username: input.username },
  });
}

export function listRequestsForUser(userId: string, status?: RequestStatus) {
  return prisma.request.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export function getRequestForUser(userId: string, requestId: string) {
  return prisma.request.findFirst({ where: { id: requestId, userId } });
}

export function createRequest(userId: string, input: RequestInput) {
  assertRequestInput(input);
  return prisma.request.create({ data: { userId, ...input } });
}

export function getTelegramSessionForUser(userId: string) {
  return prisma.telegramSession.findUnique({ where: { userId } });
}

export function listActiveTelegramSessions() {
  return prisma.telegramSession.findMany({
    where: { state: TelegramSessionState.ACTIVE, storageKey: { not: null } },
    include: { user: true },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
}

export function beginTelegramSession(userId: string, storageKey: string) {
  return prisma.telegramSession.upsert({
    where: { userId },
    create: { userId, storageKey, state: TelegramSessionState.PENDING_QR },
    update: {
      storageKey,
      connectedTelegramUserId: null,
      state: TelegramSessionState.PENDING_QR,
      membershipCheckedAt: null,
      lastError: null,
      stateChangedAt: new Date(),
    },
  });
}

export function activateTelegramSession(input: {
  userId: string;
  storageKey: string;
  connectedTelegramUserId: string;
  maxActiveSessions: number;
}) {
  return prisma.$transaction(async (tx) => {
    const activeCount = await tx.telegramSession.count({
      where: { state: TelegramSessionState.ACTIVE, userId: { not: input.userId } },
    });
    if (activeCount >= input.maxActiveSessions) throw new Error("Active Telegram session capacity reached.");
    return tx.telegramSession.update({
      where: { userId: input.userId },
      data: {
        storageKey: input.storageKey,
        connectedTelegramUserId: input.connectedTelegramUserId,
        state: TelegramSessionState.ACTIVE,
        membershipCheckedAt: new Date(),
        lastError: null,
        stateChangedAt: new Date(),
      },
    });
  });
}

export async function markTelegramSessionState(input: {
  userId: string;
  state: Exclude<TelegramSessionState, "ACTIVE">;
  error?: string | null;
  membershipChecked?: boolean;
}) {
  const session = await prisma.telegramSession.update({
    where: { userId: input.userId },
    data: {
      state: input.state,
      lastError: input.error?.slice(0, 300) ?? null,
      membershipCheckedAt: input.membershipChecked ? new Date() : undefined,
      stateChangedAt: new Date(),
    },
  });
  if (input.state === TelegramSessionState.NOT_IN_GROUP || input.state === TelegramSessionState.REVOKED) {
    await cancelAllActiveRequestsForUser(input.userId, "نشست تلگرام فعال یا عضویت گروه معتبر نیست.");
  }
  return session;
}

export function refreshTelegramSessionMembership(userId: string) {
  return prisma.telegramSession.update({
    where: { userId },
    data: { membershipCheckedAt: new Date(), lastError: null },
  });
}

export function cancelAllActiveRequestsForUser(userId: string, reason: string) {
  return prisma.request.updateMany({
    where: { userId, status: RequestStatus.ACTIVE },
    data: {
      status: RequestStatus.CANCELLED,
      cancellationReason: reason.slice(0, 300),
      completedAt: new Date(),
    },
  });
}

export async function updateActiveRequest(userId: string, requestId: string, input: RequestInput) {
  assertRequestInput(input);
  const update = await prisma.request.updateMany({
    where: { id: requestId, userId, status: RequestStatus.ACTIVE, claimToken: null },
    data: input,
  });
  return update.count === 1 ? getRequestForUser(userId, requestId) : null;
}

export async function cancelActiveRequest(userId: string, requestId: string) {
  const update = await prisma.request.updateMany({
    where: { id: requestId, userId, status: RequestStatus.ACTIVE, claimToken: null },
    data: { status: RequestStatus.CANCELLED, completedAt: new Date(), cancellationReason: null },
  });
  return update.count === 1 ? getRequestForUser(userId, requestId) : null;
}

export function findMatchingRequests(quote: number) {
  return prisma.request.findMany({
    where: {
      status: RequestStatus.ACTIVE,
      claimToken: null,
      OR: [
        { condition: "LTE", targetPrice: { gte: quote } },
        { condition: "GTE", targetPrice: { lte: quote } },
      ],
    },
  });
}

export function findMatchingRequestsForUser(userId: string, quote: number) {
  return prisma.request.findMany({
    where: {
      userId,
      status: RequestStatus.ACTIVE,
      claimToken: null,
      OR: [
        { condition: "LTE", targetPrice: { gte: quote } },
        { condition: "GTE", targetPrice: { lte: quote } },
      ],
    },
  });
}

export async function claimRequest(requestId: string) {
  const claimToken = randomUUID();
  const update = await prisma.request.updateMany({
    where: { id: requestId, status: RequestStatus.ACTIVE, claimToken: null },
    data: { claimToken, claimedAt: new Date() },
  });
  return update.count === 1
    ? prisma.request.findUnique({ where: { claimToken }, include: { user: true } })
    : null;
}

export async function completeClaimedRequest(input: {
  requestId: string;
  claimToken: string;
  quote: number;
  messageId: number;
}) {
  const update = await prisma.request.updateMany({
    where: { id: input.requestId, status: RequestStatus.ACTIVE, claimToken: input.claimToken },
    data: {
      status: RequestStatus.DONE,
      triggeredQuote: input.quote,
      triggeredMessageId: input.messageId,
      completedAt: new Date(),
    },
  });
  return update.count === 1;
}

export async function failClaimedRequest(input: {
  requestId: string;
  claimToken: string;
  quote: number;
  messageId: number;
  reason: string;
}) {
  const update = await prisma.request.updateMany({
    where: { id: input.requestId, status: RequestStatus.ACTIVE, claimToken: input.claimToken },
    data: {
      status: RequestStatus.FAILED,
      triggeredQuote: input.quote,
      triggeredMessageId: input.messageId,
      failureReason: input.reason.slice(0, 500),
      completedAt: new Date(),
    },
  });
  return update.count === 1;
}

/** A restart never retries a potentially sent financial action. */
export function failOutstandingClaims() {
  return prisma.request.updateMany({
    where: { status: RequestStatus.ACTIVE, claimToken: { not: null } },
    data: {
      status: RequestStatus.FAILED,
      failureReason: "Worker restarted before request execution was finalized.",
      completedAt: new Date(),
    },
  });
}

export { RequestStatus, TelegramSessionState };
export default prisma;
