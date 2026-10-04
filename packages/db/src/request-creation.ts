import { createHash } from "node:crypto";
import { AppError, type CreateRequestInput } from "@zarbit/contracts";
import type {
  PrismaClient,
  Prisma,
  Request as RequestRecord,
} from "../prisma/generated/client";

export function computeCreationPayloadHash(input: {
  condition: string;
  action: string;
  targetPrice: number;
  units: number | null;
}): string {
  const canonical = JSON.stringify({
    action: input.action,
    condition: input.condition,
    targetPrice: input.targetPrice,
    units: input.action === "ALERT" ? null : input.units,
  });
  return createHash("sha256").update(canonical).digest("hex").toLowerCase();
}

export async function findRequestCreation(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
  input: CreateRequestInput,
): Promise<RequestRecord | null> {
  const expectedHash = computeCreationPayloadHash(input);
  const identity = await db.requestCreationIdentity.findUnique({
    where: {
      userId_creationKey: {
        userId,
        creationKey: input.creationKey,
      },
    },
  });

  if (!identity) return null;

  if (identity.creationPayloadHash !== expectedHash) {
    throw new AppError(
      "REQUEST_CREATION_CONFLICT",
      "این تلاش ثبت با اطلاعات دیگری انجام شده است؛ وضعیت درخواست را بررسی کنید.",
      409,
    );
  }

  const existing = await db.request.findUnique({
    where: { id: identity.requestId },
  });

  if (existing) return existing;

  // If the heavy Request row has been pruned after 30 days, synthesize a tombstone row
  return {
    id: identity.requestId,
    userId: identity.userId,
    condition: input.condition,
    action: input.action,
    targetPrice: input.targetPrice,
    units: input.units,
    status: identity.status,
    executionPhase:
      identity.status === "ACTIVE" ? "WAITING_TRADE" : identity.status,
    outcomeCode: null,
    deliveryStartedAt: null,
    unknownReason: null,
    resolutionState: "NOT_APPLICABLE",
    claimToken: null,
    armedAt: identity.createdAt,
    armedAfterMessageId: 0,
    triggeredPrice: null,
    triggerSource: null,
    triggeredTradeId: null,
    triggeredChatId: null,
    triggeredAt: null,
    triggeredMessageId: null,
    outgoingMessageId: null,
    completedAt: identity.completedAt,
    failureReason: null,
    cancellationReason: null,
    creationKey: identity.creationKey,
    creationPayloadHash: identity.creationPayloadHash,
    createdAt: identity.createdAt,
    updatedAt: identity.completedAt ?? identity.createdAt,
  };
}
