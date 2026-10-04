import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../prisma/generated/client";
import { lockTradeStream } from "./trade-trigger";
import {
  applySettlement,
  settlementCoverageEvidence,
} from "./apply-settlement";

export interface RecordSettlementInput {
  chatId: bigint;
  sourceMessageId: number;
  senderId: string;
  compactPrice: number;
  announcedAt: Date;
  payloadHash: string;
  rawText: string;
}

/** Records trusted events; processing remains blocked until coverage is reviewed. */
export function createSettlementStore(db: PrismaClient) {
  return {
    observeFinancialMessage: (input: {
      chatId: bigint | number;
      sourceMessageId: number;
      senderId: string;
      rawText: string | null;
      eventKind: "NEW" | "EDIT" | "DELETE";
      payloadHash: string;
    }) =>
      db.$transaction(async (tx) => {
        if (
          !Number.isSafeInteger(input.sourceMessageId) ||
          input.sourceMessageId <= 0 ||
          !input.senderId ||
          !/^[a-f0-9]{64}$/.test(input.payloadHash) ||
          (input.eventKind === "DELETE"
            ? input.rawText !== null
            : input.rawText === null)
        ) {
          throw new Error("Invalid financial observation");
        }
        const chatId = BigInt(input.chatId);
        await lockTradeStream(tx, chatId);
        const prior = await tx.financialInbox.findFirst({
          where: {
            chatId,
            sourceMessageId: input.sourceMessageId,
            eventKind: "NEW",
            payloadHash: { not: input.payloadHash },
          },
          select: { id: true },
        });
        await tx.financialInbox.createMany({
          data: {
            chatId,
            sourceMessageId: input.sourceMessageId,
            senderId: input.senderId,
            rawText: input.rawText,
            eventKind: input.eventKind,
            payloadHash: input.payloadHash,
          },
          skipDuplicates: true,
        });
        const settlement = await tx.settlement.findUnique({
          where: {
            chatId_sourceMessageId: {
              chatId,
              sourceMessageId: input.sourceMessageId,
            },
          },
        });
        if (
          settlement &&
          (input.eventKind !== "NEW" ||
            settlement.payloadHash !== input.payloadHash ||
            settlement.senderId !== input.senderId)
        ) {
          await tx.financialInbox.updateMany({
            where: {
              chatId,
              sourceMessageId: input.sourceMessageId,
              eventKind: input.eventKind,
              payloadHash: input.payloadHash,
            },
            data: {
              errorCode:
                input.eventKind === "DELETE"
                  ? "DELETED_SETTLEMENT"
                  : "CONFLICTING_SETTLEMENT",
            },
          });
          await tx.settlement.update({
            where: { id: settlement.id },
            data: {
              reviewReason:
                input.eventKind === "DELETE"
                  ? "DELETED_MESSAGE"
                  : "CONFLICTING_PAYLOAD",
            },
          });
          await tx.groupIngestionState.upsert({
            where: { chatId },
            create: { chatId, gateStatus: "REVIEW_REQUIRED" },
            update: {
              gateStatus: "REVIEW_REQUIRED",
              analyticsRevision: { increment: 1 },
            },
          });
        } else if (input.eventKind !== "NEW" || prior) {
          const trade = await tx.trade.findUnique({
            where: {
              chatId_sourceMessageId: {
                chatId,
                sourceMessageId: input.sourceMessageId,
              },
            },
          });
          if (trade) {
            await tx.financialInbox.updateMany({
              where: {
                chatId,
                sourceMessageId: input.sourceMessageId,
                eventKind: input.eventKind,
                payloadHash: input.payloadHash,
              },
              data: {
                errorCode:
                  input.eventKind === "DELETE"
                    ? "DELETED_RECEIPT"
                    : "CONFLICTING_RECEIPT",
              },
            });
            await tx.groupIngestionState.upsert({
              where: { chatId },
              create: { chatId, gateStatus: "REVIEW_REQUIRED" },
              update: {
                gateStatus: "REVIEW_REQUIRED",
                analyticsRevision: { increment: 1 },
              },
            });
          }
        }
      }),
    flagFinancialReview: (
      chat: bigint | number,
      sourceMessageId: number,
      payloadHash: string,
      reason: string,
    ) =>
      db.$transaction(async (tx) => {
        const chatId = BigInt(chat);
        await lockTradeStream(tx, chatId);
        await tx.financialInbox.updateMany({
          where: { chatId, sourceMessageId, payloadHash },
          data: { errorCode: reason },
        });
        await tx.groupIngestionState.upsert({
          where: { chatId },
          create: { chatId, gateStatus: "REVIEW_REQUIRED" },
          update: {
            gateStatus: "REVIEW_REQUIRED",
            analyticsRevision: { increment: 1 },
          },
        });
      }),
    completeFinancialMessage: (
      chat: bigint | number,
      sourceMessageId: number,
      payloadHash: string,
    ) =>
      db.financialInbox.updateMany({
        where: {
          chatId: BigInt(chat),
          sourceMessageId,
          eventKind: "NEW",
          payloadHash,
          errorCode: null,
        },
        data: { processedAt: new Date() },
      }),
    financialObservationFlagged: async (
      chat: bigint | number,
      sourceMessageId: number,
      payloadHash: string,
    ): Promise<boolean> => {
      const row = await db.financialInbox.findFirst({
        where: {
          chatId: BigInt(chat),
          sourceMessageId,
          payloadHash,
          errorCode: { not: null },
        },
        select: { id: true },
      });
      return row !== null;
    },
    financialMessagesInInterval: (
      chat: bigint | number,
      after: number,
      before: number,
    ) =>
      db.financialInbox.findMany({
        where: {
          chatId: BigInt(chat),
          eventKind: "NEW",
          sourceMessageId: { gt: after, lt: before },
        },
        orderBy: [{ sourceMessageId: "asc" }, { id: "asc" }],
      }),
    unprocessedFinancialMessages: (chat: bigint | number) =>
      db.financialInbox.findMany({
        where: {
          chatId: BigInt(chat),
          eventKind: "NEW",
          processedAt: null,
          errorCode: null,
        },
        orderBy: [{ sourceMessageId: "asc" }, { id: "asc" }],
      }),
    beginFinancialRecovery: (chat: bigint | number) =>
      db.$transaction(async (tx) => {
        const chatId = BigInt(chat);
        await lockTradeStream(tx, chatId);
        const state = await tx.groupIngestionState.upsert({
          where: { chatId },
          create: {
            chatId,
            historyRecoveryRequired: true,
            historyRecoveryGeneration: 1,
            gateStatus: "REVIEW_REQUIRED",
          },
          update: {
            historyRecoveryRequired: true,
            historyRecoveryGeneration: { increment: 1 },
            gateStatus: "REVIEW_REQUIRED",
            analyticsRevision: { increment: 1 },
          },
        });
        return state.historyRecoveryGeneration;
      }),
    completeFinancialRecovery: (
      chat: bigint | number,
      expectedGeneration?: number,
    ) =>
      db.$transaction(async (tx) => {
        const chatId = BigInt(chat);
        await lockTradeStream(tx, chatId);
        const current = await tx.groupIngestionState.findUnique({
          where: { chatId },
        });
        if (
          expectedGeneration !== undefined &&
          current &&
          current.historyRecoveryGeneration !== expectedGeneration
        ) {
          return false;
        }
        const [flagged, pending] = await Promise.all([
          tx.financialInbox.count({
            where: { chatId, errorCode: { not: null } },
          }),
          tx.settlement.count({
            where: {
              chatId,
              OR: [
                { status: { not: "APPLIED" } },
                { reviewReason: { not: null } },
              ],
            },
          }),
        ]);
        await tx.groupIngestionState.update({
          where: { chatId },
          data: {
            historyRecoveryRequired: false,
            gateStatus: flagged || pending ? "REVIEW_REQUIRED" : "OPEN",
            analyticsRevision: { increment: 1 },
          },
        });
        return true;
      }),
    markHistoryScanned: (chat: bigint | number, throughMessageId: number) =>
      db.$transaction(async (tx) => {
        if (!Number.isSafeInteger(throughMessageId) || throughMessageId <= 0) {
          throw new Error("Invalid history watermark");
        }
        const chatId = BigInt(chat);
        await lockTradeStream(tx, chatId);
        const state = await tx.groupIngestionState.upsert({
          where: { chatId },
          create: { chatId, scannedThroughMessageId: throughMessageId },
          update: {},
        });
        if (throughMessageId > state.scannedThroughMessageId)
          await tx.groupIngestionState.update({
            where: { chatId },
            data: { scannedThroughMessageId: throughMessageId },
          });
      }),
    ingestionState: (chat: bigint | number) =>
      db.groupIngestionState.findUnique({
        where: { chatId: BigInt(chat) },
      }),
    financialMessageKnown: async (
      chat: bigint | number,
      sourceMessageId: number,
    ) => {
      const chatId = BigInt(chat);
      const [inbox, trade, settlement] = await Promise.all([
        db.financialInbox.findFirst({
          where: { chatId, sourceMessageId },
          select: { id: true },
        }),
        db.trade.findUnique({
          where: { chatId_sourceMessageId: { chatId, sourceMessageId } },
          select: { id: true },
        }),
        db.settlement.findUnique({
          where: { chatId_sourceMessageId: { chatId, sourceMessageId } },
          select: { id: true },
        }),
      ]);
      return Boolean(inbox || trade || settlement);
    },
    normalTradeExists: async (chat: bigint | number, sourceMessageId: number) =>
      (await db.trade.findUnique({
        where: {
          chatId_sourceMessageId: {
            chatId: BigInt(chat),
            sourceMessageId,
          },
        },
        select: { id: true },
      })) !== null,
    pendingSettlements: (chat: bigint | number) =>
      db.settlement.findMany({
        where: { chatId: BigInt(chat), status: { not: "APPLIED" } },
        orderBy: { sourceMessageId: "asc" },
      }),
    settlementByMessage: (chat: bigint | number, sourceMessageId: number) =>
      db.settlement.findUnique({
        where: {
          chatId_sourceMessageId: {
            chatId: BigInt(chat),
            sourceMessageId,
          },
        },
      }),
    appliedSettlements: () =>
      db.settlement.findMany({
        where: { status: "APPLIED" },
        orderBy: [{ chatId: "asc" }, { sourceMessageId: "asc" }],
      }),
    hasAppliedSettlement: async () =>
      (await db.settlement.findFirst({
        where: { status: "APPLIED" },
        select: { id: true },
      })) !== null,
    analyticsRevision: async () =>
      (
        await db.groupIngestionState.findMany({
          orderBy: { chatId: "asc" },
          select: { chatId: true, analyticsRevision: true },
        })
      )
        .map((row) => `${row.chatId}:${row.analyticsRevision}`)
        .join("|"),
    coverageEvidence: (
      chat: bigint | number,
      previousMessageId: number,
      settlementMessageId: number,
    ) =>
      db.$transaction((tx) =>
        settlementCoverageEvidence(
          tx,
          BigInt(chat),
          previousMessageId,
          settlementMessageId,
        ),
      ),
    applySettlement: (
      chat: bigint | number,
      sourceMessageId: number,
      review?: {
        coverageDigest: string;
        reviewedBy: string;
      },
    ) => applySettlement(db, BigInt(chat), sourceMessageId, review),
    recordSettlement: (input: RecordSettlementInput) => {
      if (
        !Number.isInteger(input.sourceMessageId) ||
        input.sourceMessageId <= 0 ||
        !Number.isInteger(input.compactPrice) ||
        input.compactPrice <= 0 ||
        input.compactPrice > 2_147_483_647 ||
        !/^\d+$/.test(input.senderId) ||
        !/^[a-f0-9]{64}$/.test(input.payloadHash) ||
        !Number.isFinite(input.announcedAt.getTime())
      ) {
        throw new Error("Invalid normalized settlement event");
      }
      return db.$transaction(async (tx) => {
        await lockTradeStream(tx, input.chatId);
        const key = {
          chatId: input.chatId,
          sourceMessageId: input.sourceMessageId,
        };
        await tx.financialInbox.createMany({
          data: {
            ...key,
            senderId: input.senderId,
            rawText: input.rawText,
            eventKind: "NEW",
            payloadHash: input.payloadHash,
          },
          skipDuplicates: true,
        });
        const existing = await tx.settlement.findUnique({
          where: { chatId_sourceMessageId: key },
        });
        if (existing) {
          if (
            existing.payloadHash === input.payloadHash &&
            existing.senderId === input.senderId &&
            existing.compactPrice === input.compactPrice &&
            existing.announcedAt.getTime() === input.announcedAt.getTime()
          )
            return existing;
          await tx.financialInbox.updateMany({
            where: { ...key, payloadHash: input.payloadHash },
            data: { errorCode: "CONFLICTING_SETTLEMENT" },
          });
          await tx.groupIngestionState.upsert({
            where: { chatId: input.chatId },
            create: { chatId: input.chatId, gateStatus: "REVIEW_REQUIRED" },
            update: {
              gateStatus: "REVIEW_REQUIRED",
              analyticsRevision: { increment: 1 },
            },
          });
          // Preserve the first accepted financial payload and its applied status.
          return tx.settlement.update({
            where: { id: existing.id },
            data: { reviewReason: "CONFLICTING_PAYLOAD" },
          });
        }
        const ingestion = await tx.groupIngestionState.findUnique({
          where: { chatId: input.chatId },
        });
        if (
          ingestion &&
          input.sourceMessageId <= ingestion.appliedThroughMessageId
        ) {
          await tx.financialInbox.updateMany({
            where: { ...key, payloadHash: input.payloadHash },
            data: { errorCode: "LATE_SETTLEMENT" },
          });
          await tx.groupIngestionState.update({
            where: { chatId: input.chatId },
            data: {
              gateStatus: "REVIEW_REQUIRED",
              analyticsRevision: { increment: 1 },
            },
          });
          return null;
        }
        const previous = await tx.settlement.findFirst({
          where: { chatId: input.chatId },
          orderBy: { sourceMessageId: "desc" },
        });
        if (previous && input.sourceMessageId < previous.sourceMessageId) {
          await tx.financialInbox.updateMany({
            where: { ...key, payloadHash: input.payloadHash },
            data: { errorCode: "OUT_OF_ORDER_SETTLEMENT" },
          });
          await tx.groupIngestionState.upsert({
            where: { chatId: input.chatId },
            create: { chatId: input.chatId, gateStatus: "REVIEW_REQUIRED" },
            update: {
              gateStatus: "REVIEW_REQUIRED",
              analyticsRevision: { increment: 1 },
            },
          });
          return null;
        }
        const baseline = previous === null;
        const settlement = await tx.settlement.create({
          data: {
            id: randomUUID(),
            chatId: input.chatId,
            sourceMessageId: input.sourceMessageId,
            senderId: input.senderId,
            compactPrice: input.compactPrice,
            announcedAt: input.announcedAt,
            payloadHash: input.payloadHash,
            isBootstrap: baseline,
            status: "RECEIVED",
            reviewReason: null,
          },
        });
        await tx.groupIngestionState.upsert({
          where: { chatId: input.chatId },
          create: {
            chatId: input.chatId,
            appliedThroughMessageId: 0,
            gateStatus: "REVIEW_REQUIRED",
            analyticsRevision: 1,
          },
          update: {
            gateStatus: "REVIEW_REQUIRED",
            analyticsRevision: { increment: 1 },
          },
        });
        return settlement;
      });
    },
  };
}
