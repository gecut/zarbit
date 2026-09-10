import { randomUUID } from "node:crypto";
import type {
  Participant,
  ParticipantResolutionStatus,
  PrismaClient,
  Trade,
  TradingAction,
  TradingActionStatus,
  TradingActionType,
} from "../prisma/generated/client";

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

        return { tradeRecorded: result.count === 1 };
      });
    },

    latestTrade: (
      chatId?: bigint | number,
    ): Promise<
      | (Trade & {
          buyerParticipant: Participant;
          sellerParticipant: Participant;
        })
      | null
    > =>
      db.trade.findFirst({
        where: chatId !== undefined ? { chatId: BigInt(chatId) } : undefined,
        orderBy: [{ announcedAt: "desc" }, { sourceMessageId: "desc" }],
        include: {
          buyerParticipant: true,
          sellerParticipant: true,
        },
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
  };
}
