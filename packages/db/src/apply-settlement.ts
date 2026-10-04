import { createHash } from "node:crypto";
import {
  calculatePositionTransition,
  calculateSettlementTrades,
  createInitialPositionState,
} from "@zarbit/domain";
import type { Prisma, PrismaClient } from "../prisma/generated/client";
import { lockTradeStream } from "./trade-trigger";

export async function settlementCoverageEvidence(
  tx: Prisma.TransactionClient,
  chatId: bigint,
  previousMessageId: number,
  settlementMessageId: number,
) {
  const observations = await tx.financialInbox.findMany({
    where: {
      chatId,
      sourceMessageId: { gt: previousMessageId, lt: settlementMessageId },
    },
    orderBy: [
      { sourceMessageId: "asc" },
      { eventKind: "asc" },
      { payloadHash: "asc" },
    ],
  });
  const trades = await tx.trade.findMany({
    where: {
      chatId,
      type: "NORMAL",
      sourceMessageId: { gt: previousMessageId, lt: settlementMessageId },
    },
    select: {
      id: true,
      sourceMessageId: true,
      quantity: true,
      compactPrice: true,
      rawPrice: true,
      announcedAt: true,
      buyerParticipantId: true,
      sellerParticipantId: true,
    },
    orderBy: [{ sourceMessageId: "asc" }, { id: "asc" }],
  });
  const observationsById = new Map<number, typeof observations>();
  for (const row of observations) {
    const current = observationsById.get(row.sourceMessageId) ?? [];
    current.push(row);
    observationsById.set(row.sourceMessageId, current);
  }
  const tradeIds = new Set(trades.map((row) => row.sourceMessageId));
  const unresolvedCount =
    observations.filter(
      (row) =>
        row.processedAt === null ||
        row.eventKind !== "NEW" ||
        !tradeIds.has(row.sourceMessageId),
    ).length +
    trades.filter(
      (row) =>
        row.sourceMessageId === null ||
        observationsById
          .get(row.sourceMessageId)
          ?.filter(
            (seen) => seen.eventKind === "NEW" && seen.processedAt !== null,
          ).length !== 1,
    ).length;
  const digest = createHash("sha256")
    .update(`${chatId}:${previousMessageId}:${settlementMessageId}\n`)
    .update(
      observations
        .map(
          (row) =>
            `${row.sourceMessageId}:${row.eventKind}:${row.payloadHash}\n`,
        )
        .join(""),
    )
    .update(
      trades
        .map(
          (row) =>
            `${row.id}:${row.sourceMessageId}:${row.quantity}:` +
            `${row.compactPrice}:${row.rawPrice}:${row.announcedAt.toISOString()}:` +
            `${row.buyerParticipantId}:${row.sellerParticipantId}\n`,
        )
        .join(""),
    )
    .digest("hex");
  return {
    digest,
    observationCount: observations.length,
    tradeCount: trades.length,
    unresolvedCount,
  };
}

export function applySettlement(
  db: PrismaClient,
  chatId: bigint,
  sourceMessageId: number,
  review?: {
    coverageDigest: string;
    reviewedBy: string;
  },
) {
  return db.$transaction(async (tx) => {
    await lockTradeStream(tx, chatId);
    const settlement = await tx.settlement.findUniqueOrThrow({
      where: { chatId_sourceMessageId: { chatId, sourceMessageId } },
    });
    if (settlement.status === "APPLIED") return settlement;
    if (
      settlement.reviewReason &&
      settlement.reviewReason !== "COVERAGE_NOT_PROVEN"
    ) {
      throw new Error("Settlement conflict requires manual reconciliation");
    }
    const state = await tx.groupIngestionState.findUniqueOrThrow({
      where: { chatId },
    });
    if (state.historyRecoveryRequired)
      throw new Error("Telegram history recovery is incomplete");
    const [flaggedObservation, flaggedSettlement] = await Promise.all([
      tx.financialInbox.findFirst({
        where: { chatId, errorCode: { not: null } },
        select: { id: true },
      }),
      tx.settlement.findFirst({
        where: {
          chatId,
          reviewReason: { not: null },
          id: { not: settlement.id },
        },
        select: { id: true },
      }),
    ]);
    if (flaggedObservation || flaggedSettlement) {
      throw new Error(
        "Financial review must be reconciled before applying settlement",
      );
    }
    if (sourceMessageId <= state.appliedThroughMessageId) {
      throw new Error("Settlement boundary cannot move backwards");
    }
    const previous = await tx.settlement.findFirst({
      where: { chatId, sourceMessageId: { lt: sourceMessageId } },
      orderBy: { sourceMessageId: "desc" },
    });
    if (previous && previous.status !== "APPLIED")
      throw new Error("Earlier settlement is pending");
    if (settlement.isBootstrap !== (previous === null))
      throw new Error("Bootstrap boundary mismatch");
    if (previous && state.scannedThroughMessageId < sourceMessageId) {
      throw new Error("History scan is incomplete");
    }
    if (previous && (!review?.coverageDigest || !review.reviewedBy)) {
      throw new Error("Reviewed receipt coverage is required");
    }
    if (previous) {
      const coverage = await settlementCoverageEvidence(
        tx,
        chatId,
        previous.sourceMessageId,
        sourceMessageId,
      );
      if (coverage.unresolvedCount > 0)
        throw new Error("Financial observations require review");
      if (coverage.digest !== review?.coverageDigest) {
        throw new Error(
          "Coverage review no longer matches the observed interval",
        );
      }
    }

    if (previous) {
      const rows = await tx.trade.findMany({
        where: {
          chatId,
          type: "NORMAL",
          sourceMessageId: {
            gt: previous.sourceMessageId,
            lt: sourceMessageId,
          },
        },
        orderBy: [{ sourceMessageId: "asc" }, { id: "asc" }],
      });
      const units = new Map<string, { buyUnits: number; sellUnits: number }>();
      const states = new Map<
        string,
        ReturnType<typeof createInitialPositionState>
      >();
      for (const row of rows) {
        if (
          row.sourceMessageId === null ||
          !row.buyerParticipantId ||
          !row.sellerParticipantId
        ) {
          throw new Error("Malformed NORMAL trade");
        }
        const sides = [
          { participantId: row.buyerParticipantId, side: "BUY" as const },
          { participantId: row.sellerParticipantId, side: "SELL" as const },
        ];
        for (const { participantId, side } of sides) {
          const count = units.get(participantId) ?? {
            buyUnits: 0,
            sellUnits: 0,
          };
          count[side === "BUY" ? "buyUnits" : "sellUnits"] += row.quantity;
          units.set(participantId, count);
          const transition = calculatePositionTransition(
            states.get(participantId) ??
              createInitialPositionState({ hasZeroCrossing: true }),
            {
              id: row.id,
              sourceMessageId: row.sourceMessageId,
              side,
              quantity: row.quantity,
              compactPrice: row.compactPrice,
              announcedAt: row.announcedAt,
            },
          );
          states.set(participantId, transition.nextPosition);
        }
      }
      const synthetic = calculateSettlementTrades(
        [...units].map(([participantId, counts]) => ({
          participantId,
          ...counts,
        })),
        settlement.compactPrice,
      );
      for (const trade of synthetic) {
        const before = states.get(trade.participantId);
        const signedQuantity =
          trade.side === "SELL" ? trade.quantity : -trade.quantity;
        if (!before || before.netQuantity !== signedQuantity)
          throw new Error("Settlement position mismatch");
        const next = calculatePositionTransition(before, {
          id: `${settlement.id}:${trade.participantId}`,
          sourceMessageId,
          side: trade.side,
          quantity: trade.quantity,
          compactPrice: settlement.compactPrice,
          announcedAt: settlement.announcedAt,
        }).nextPosition;
        if (next.netQuantity !== 0 || next.costBasis !== 0)
          throw new Error("Settlement close failed");
        await tx.trade.create({
          data: {
            chatId,
            type: "SETTLEMENT",
            settlementMessageId: sourceMessageId,
            buyerParticipantId:
              trade.side === "BUY" ? trade.participantId : null,
            sellerParticipantId:
              trade.side === "SELL" ? trade.participantId : null,
            quantity: trade.quantity,
            compactPrice: settlement.compactPrice,
            rawPrice: BigInt(settlement.compactPrice) * 1_000n,
            announcedAt: settlement.announcedAt,
          },
        });
      }
    }
    const applied = await tx.settlement.update({
      where: { id: settlement.id },
      data: {
        status: "APPLIED",
        reviewReason: null,
        coverageDigest: review?.coverageDigest ?? null,
        coverageReviewedBy: review?.reviewedBy ?? null,
      },
    });
    const laterPending = await tx.settlement.findFirst({
      where: {
        chatId,
        sourceMessageId: { gt: sourceMessageId },
        status: { not: "APPLIED" },
      },
      select: { id: true },
    });
    await tx.groupIngestionState.update({
      where: { chatId },
      data: {
        appliedThroughMessageId: sourceMessageId,
        gateStatus: laterPending ? "REVIEW_REQUIRED" : "OPEN",
        ...(review
          ? {
              coverageVerifiedThroughMessageId: sourceMessageId,
              coverageDigest: review.coverageDigest,
            }
          : {}),
        analyticsRevision: { increment: 1 },
      },
    });
    await tx.financialInbox.updateMany({
      where: {
        chatId,
        sourceMessageId,
        eventKind: "NEW",
        payloadHash: settlement.payloadHash,
      },
      data: { processedAt: new Date() },
    });
    return applied;
  });
}
