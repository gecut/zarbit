import { notifyMarketChange } from "./market-notifications";
import { randomUUID } from "node:crypto";
import { Prisma } from "../prisma/generated/client";
import type {
  Participant,
  ParticipantResolutionStatus,
  PrismaClient,
  Trade,
  TradingAction,
  TradingActionStatus,
  TradingActionType,
  TradingSide,
} from "../prisma/generated/client";

export type {
  TradingAction,
  TradingActionStatus,
  TradingActionType,
  TradingSide,
};

export interface RecordTradeInput {
  chatId: bigint | number;
  sourceMessageId: number;
  referenceNumber?: string | null;
  buyerAlias: string;
  sellerAlias: string;
  quantity: number;
  compactPrice: number;
  rawPrice?: bigint | number;
  receiptTimeText?: string | null;
  announcedAt: Date;
}

export interface RecordTradingActionInput {
  chatId: bigint | number;
  sourceMessageId: number;
  senderId: string;
  actionType: TradingActionType;
  side?: TradingSide | null;
  rawText: string;
  quantity?: number | null;
  compactPrice?: number | null;
  replyToMessageId?: number | null;
  replyToSenderId?: string | null;
  targetOrderMessageId?: number | null;
  status?: TradingActionStatus;
  confirmedByMessageId?: number | null;
  participantId?: string | null;
  observedAt: Date;
}

export interface UpsertParticipantInput {
  id: string;
  telegramUserId?: string | null;
  resolutionStatus?: ParticipantResolutionStatus;
  confirmationCount?: number;
  lastConfirmedAt?: Date | null;
}

export interface ConfirmParticipantIdentityInput {
  chatId: bigint | number;
  sourceMessageId: number;
  canonicalMessageId: number;
  participantId: string;
  senderId: string;
  actionType: "ORDER_BUY" | "ORDER_SELL";
  quantity: number;
  compactPrice: number;
  confirmedAt: Date;
}

export type ParticipantIdentityConfirmationResult =
  | { outcome: "confirmed"; confirmationCount: number; verified: boolean }
  | { outcome: "conflict"; resolutionStatus: ParticipantResolutionStatus }
  | { outcome: "duplicate" }
  | { outcome: "rejected" };

const participantIdentityConfirmationThreshold = 5;

export function createMarketDataStore(
  db: PrismaClient,
  _now: () => Date = () => new Date(),
) {
  return {
    participant: (id: string): Promise<Participant | null> =>
      db.participant.findUnique({
        where: { id },
      }),

    findParticipantByTelegramId: (
      telegramUserId: string,
    ): Promise<Participant | null> =>
      db.participant.findFirst({
        where: { telegramUserId },
      }),

    upsertParticipant: (input: UpsertParticipantInput): Promise<Participant> =>
      db.participant.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          telegramUserId: input.telegramUserId ?? null,
          resolutionStatus: input.resolutionStatus ?? "UNRESOLVED",
          confirmationCount: input.confirmationCount ?? 0,
          lastConfirmedAt: input.lastConfirmedAt ?? null,
        },
        update: {
          ...(input.telegramUserId !== undefined
            ? { telegramUserId: input.telegramUserId }
            : {}),
          ...(input.resolutionStatus !== undefined
            ? { resolutionStatus: input.resolutionStatus }
            : {}),
          ...(input.confirmationCount !== undefined
            ? { confirmationCount: input.confirmationCount }
            : {}),
          ...(input.lastConfirmedAt !== undefined
            ? { lastConfirmedAt: input.lastConfirmedAt }
            : {}),
        },
      }),

    recordTrade: async (
      input: RecordTradeInput,
    ): Promise<{ tradeRecorded: boolean }> => {
      const chatId = BigInt(input.chatId);
      const rawPrice =
        input.rawPrice !== undefined
          ? BigInt(input.rawPrice)
          : BigInt(input.compactPrice) * 1_000n;

      return db.$transaction(async (tx) => {
        await tx.participant.upsert({
          where: { id: input.buyerAlias },
          create: { id: input.buyerAlias },
          update: {},
        });

        if (input.sellerAlias !== input.buyerAlias) {
          await tx.participant.upsert({
            where: { id: input.sellerAlias },
            create: { id: input.sellerAlias },
            update: {},
          });
        }

        const result = await tx.trade.createMany({
          data: {
            id: randomUUID(),
            chatId,
            sourceMessageId: input.sourceMessageId,
            referenceNumber: input.referenceNumber ?? null,
            buyerParticipantId: input.buyerAlias,
            sellerParticipantId: input.sellerAlias,
            quantity: input.quantity,
            compactPrice: input.compactPrice,
            rawPrice,
            receiptTimeText: input.receiptTimeText ?? null,
            announcedAt: input.announcedAt,
          },
          skipDuplicates: true,
        });

        if (result.count === 1) {
          await notifyMarketChange(tx, {
            type: "TRADE",
            sourceMessageId: input.sourceMessageId,
          });
        }
        return { tradeRecorded: result.count === 1 };
      });
    },

    latestTrade: (chatId?: bigint | number): Promise<Trade | null> =>
      db.trade.findFirst({
        where: chatId !== undefined ? { chatId: BigInt(chatId) } : undefined,
        orderBy: [{ announcedAt: "desc" }, { sourceMessageId: "desc" }],
      }),

    tradesSince: (
      announcedAt: Date,
      options?: { chatId?: bigint | number; limit?: number },
    ): Promise<Trade[]> =>
      db.trade.findMany({
        where: {
          announcedAt: { gte: announcedAt },
          ...(options?.chatId !== undefined
            ? { chatId: BigInt(options.chatId) }
            : {}),
        },
        orderBy: [{ announcedAt: "asc" }, { sourceMessageId: "asc" }],
        ...(options?.limit !== undefined ? { take: options.limit } : {}),
      }),

    participantTrades: (
      participantId: string,
      options?: { since?: Date; limit?: number },
    ): Promise<Trade[]> =>
      db.trade.findMany({
        where: {
          OR: [
            { buyerParticipantId: participantId },
            { sellerParticipantId: participantId },
          ],
          ...(options?.since !== undefined
            ? { announcedAt: { gte: options.since } }
            : {}),
        },
        orderBy: [{ announcedAt: "desc" }, { sourceMessageId: "desc" }],
        ...(options?.limit !== undefined ? { take: options.limit } : {}),
      }),

    recordTradingAction: async (
      input: RecordTradingActionInput,
    ): Promise<{ actionRecorded: boolean }> => {
      const chatId = BigInt(input.chatId);

      return db.$transaction(async (tx) => {
        if (input.participantId) {
          await tx.participant.upsert({
            where: { id: input.participantId },
            create: { id: input.participantId },
            update: {},
          });
        }

        const result = await tx.tradingAction.createMany({
          data: {
            chatId,
            sourceMessageId: input.sourceMessageId,
            senderId: input.senderId,
            actionType: input.actionType,
            side: input.side ?? null,
            rawText: input.rawText,
            quantity: input.quantity ?? null,
            compactPrice: input.compactPrice ?? null,
            replyToMessageId: input.replyToMessageId ?? null,
            replyToSenderId: input.replyToSenderId ?? null,
            targetOrderMessageId: input.targetOrderMessageId ?? null,
            status: input.status ?? "OBSERVED",
            confirmedByMessageId: input.confirmedByMessageId ?? null,
            participantId: input.participantId ?? null,
            observedAt: input.observedAt,
          },
          skipDuplicates: true,
        });

        return { actionRecorded: result.count === 1 };
      });
    },

    tradingActionsByOrder: (
      chatId: bigint | number,
      targetOrderMessageId: number,
    ): Promise<TradingAction[]> =>
      db.tradingAction.findMany({
        where: {
          chatId: BigInt(chatId),
          targetOrderMessageId,
        },
        orderBy: [{ observedAt: "asc" }, { sourceMessageId: "asc" }],
      }),

    participantActions: (
      participantId: string,
      options?: { since?: Date; limit?: number },
    ): Promise<TradingAction[]> =>
      db.tradingAction.findMany({
        where: {
          participantId,
          ...(options?.since !== undefined
            ? { observedAt: { gte: options.since } }
            : {}),
        },
        orderBy: [{ observedAt: "desc" }, { sourceMessageId: "desc" }],
        ...(options?.limit !== undefined ? { take: options.limit } : {}),
      }),

    findTradingActionForIdentityCorrelation: (
      chatId: bigint | number,
      sourceMessageId: number,
    ): Promise<TradingAction | null> =>
      db.tradingAction.findUnique({
        where: {
          chatId_sourceMessageId: {
            chatId: BigInt(chatId),
            sourceMessageId,
          },
        },
      }),

    findCandidateActionsForIdentityCorrelation: (
      chatId: bigint | number,
      windowStart: Date,
      windowEnd: Date,
      maxMessageId: number,
    ): Promise<TradingAction[]> =>
      db.tradingAction.findMany({
        where: {
          chatId: BigInt(chatId),
          observedAt: {
            gte: windowStart,
            lte: windowEnd,
          },
          sourceMessageId: {
            lt: maxMessageId,
          },
          actionType: {
            in: ["ORDER_BUY", "ORDER_SELL"],
          },
        },
        orderBy: [{ observedAt: "asc" }, { sourceMessageId: "asc" }],
      }),

    confirmParticipantIdentity: async (
      input: ConfirmParticipantIdentityInput,
    ): Promise<ParticipantIdentityConfirmationResult> => {
      const chatId = BigInt(input.chatId);

      try {
        return await db.$transaction(async (tx) => {
          const action = await tx.tradingAction.findUnique({
            where: {
              chatId_sourceMessageId: {
                chatId,
                sourceMessageId: input.sourceMessageId,
              },
            },
          });

          if (
            !action ||
            action.senderId !== input.senderId ||
            action.actionType !== input.actionType ||
            action.quantity !== input.quantity ||
            action.compactPrice !== input.compactPrice
          ) {
            return { outcome: "rejected" };
          }

          if (action.confirmedByMessageId !== null) {
            return action.confirmedByMessageId === input.canonicalMessageId
              ? { outcome: "duplicate" }
              : { outcome: "rejected" };
          }

          if (action.status !== "OBSERVED" || action.participantId !== null) {
            return { outcome: "rejected" };
          }

          const participant = await tx.participant.upsert({
            where: { id: input.participantId },
            create: { id: input.participantId },
            update: {},
          });
          const participantWithSameTelegramId = await tx.participant.findFirst({
            where: {
              telegramUserId: input.senderId,
              id: { not: input.participantId },
            },
          });
          const participantActionWithDifferentSender =
            await tx.tradingAction.findFirst({
              where: {
                participantId: input.participantId,
                senderId: { not: input.senderId },
                confirmedByMessageId: { not: null },
              },
            });
          const differentParticipantActionWithSameSender =
            await tx.tradingAction.findFirst({
              where: {
                participantId: { not: input.participantId },
                senderId: input.senderId,
                confirmedByMessageId: { not: null },
              },
            });
          const participantWithSameTelegramEvidence =
            differentParticipantActionWithSameSender?.participantId == null
              ? null
              : await tx.participant.findUnique({
                  where: {
                    id: differentParticipantActionWithSameSender.participantId,
                  },
                });
          const hasAliasConflict =
            (participant.telegramUserId !== null &&
              participant.telegramUserId !== input.senderId) ||
            participantActionWithDifferentSender !== null;
          const conflictingParticipant =
            participantWithSameTelegramId ??
            participantWithSameTelegramEvidence;
          const hasTelegramConflict = conflictingParticipant !== null;

          if (
            hasAliasConflict ||
            hasTelegramConflict ||
            participant.resolutionStatus === "CONFLICT" ||
            participant.resolutionStatus === "CONFLICT_FLAGGED"
          ) {
            await tx.tradingAction.updateMany({
              where: {
                id: action.id,
                status: "OBSERVED",
                participantId: null,
                confirmedByMessageId: null,
              },
              data: {
                status: "AMBIGUOUS",
                participantId: null,
                confirmedByMessageId: null,
              },
            });

            const resolutionStatus =
              participant.resolutionStatus === "VERIFIED"
                ? "CONFLICT_FLAGGED"
                : "CONFLICT";
            await tx.participant.update({
              where: { id: input.participantId },
              data: { resolutionStatus },
            });

            if (conflictingParticipant) {
              await tx.participant.update({
                where: { id: conflictingParticipant.id },
                data: {
                  resolutionStatus:
                    conflictingParticipant.resolutionStatus === "VERIFIED"
                      ? "CONFLICT_FLAGGED"
                      : "CONFLICT",
                },
              });
            }

            return { outcome: "conflict", resolutionStatus };
          }

          const actionUpdated = await tx.tradingAction.updateMany({
            where: {
              id: action.id,
              status: "OBSERVED",
              participantId: null,
              confirmedByMessageId: null,
            },
            data: {
              status: "CONFIRMED_BY_BOT",
              participantId: input.participantId,
              confirmedByMessageId: input.canonicalMessageId,
            },
          });

          if (actionUpdated.count !== 1) {
            return { outcome: "duplicate" };
          }

          const confirmationCount = participant.confirmationCount + 1;
          const verified =
            confirmationCount >= participantIdentityConfirmationThreshold;
          await tx.participant.update({
            where: { id: input.participantId },
            data: {
              telegramUserId: verified
                ? input.senderId
                : participant.telegramUserId,
              confirmationCount,
              lastConfirmedAt: input.confirmedAt,
              resolutionStatus: verified ? "VERIFIED" : "CANDIDATE",
            },
          });

          return { outcome: "confirmed", confirmationCount, verified };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const target = String(error.meta?.target ?? "");
          if (target.includes("telegramUserId")) {
            return { outcome: "conflict", resolutionStatus: "CONFLICT" };
          }
          return { outcome: "duplicate" };
        }
        throw error;
      }
    },
  };
}
