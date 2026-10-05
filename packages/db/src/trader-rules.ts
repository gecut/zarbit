import type { PrismaClient } from "../prisma/generated/client";
import type {
  TraderRule,
  TraderRuleExecution,
  TraderRuleTrigger,
  TraderRuleSide,
  TraderRuleStatus,
  TraderFollowDirection,
  TraderFollowSizing,
  TraderRuleAlertStatus,
  TraderRuleFollowStatus,
  TradingSide,
} from "../prisma/generated/client";

export interface CreateTraderRuleInput {
  traderAlias: string;
  trigger: TraderRuleTrigger;
  side: TraderRuleSide;
  minQuantity?: number;
  alertEnabled?: boolean;
  followEnabled?: boolean;
  followDirection?: TraderFollowDirection | null;
  followSizing?: TraderFollowSizing | null;
  fixedQuantity?: number | null;
  maxQuantity?: number | null;
}

export interface UpdateTraderRuleInput {
  side?: TraderRuleSide;
  minQuantity?: number;
  alertEnabled?: boolean;
  followEnabled?: boolean;
  followDirection?: TraderFollowDirection | null;
  followSizing?: TraderFollowSizing | null;
  fixedQuantity?: number | null;
  maxQuantity?: number | null;
  status?: TraderRuleStatus;
}

export interface FindMatchingTraderRulesParams {
  traderAlias: string;
  trigger: TraderRuleTrigger;
  side: TradingSide;
  quantity: number;
}

export interface RecordTraderRuleExecutionInput {
  ruleId: string;
  userId: string;
  traderAlias: string;
  trigger: TraderRuleTrigger;
  eventSide: TradingSide;
  eventQuantity: number;
  eventPrice: number;
  sourceMessageId?: number | null;
  chatId?: bigint | number | null;
  alertStatus?: TraderRuleAlertStatus;
  followStatus?: TraderRuleFollowStatus;
  followSide?: TradingSide | null;
  followQuantity?: number | null;
  followPrice?: number | null;
  outgoingMessageId?: number | null;
  errorMessage?: string | null;
}

export function createTraderRuleStore(prisma: PrismaClient) {
  return {
    listTraderRules: async (userId: string): Promise<TraderRule[]> => {
      return prisma.traderRule.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }],
      });
    },

    getTraderRule: async (
      id: string,
      userId: string,
    ): Promise<TraderRule | null> => {
      return prisma.traderRule.findFirst({
        where: { id, userId },
      });
    },

    createTraderRule: async (
      userId: string,
      input: CreateTraderRuleInput,
    ): Promise<TraderRule> => {
      // Ensure participant exists or upsert it
      await prisma.participant.upsert({
        where: { id: input.traderAlias },
        create: { id: input.traderAlias },
        update: {},
      });

      return prisma.traderRule.create({
        data: {
          userId,
          traderAlias: input.traderAlias,
          trigger: input.trigger,
          side: input.side,
          minQuantity: input.minQuantity ?? 1,
          alertEnabled: input.alertEnabled ?? true,
          followEnabled: input.followEnabled ?? false,
          followDirection: input.followDirection ?? null,
          followSizing: input.followSizing ?? null,
          fixedQuantity: input.fixedQuantity ?? null,
          maxQuantity: input.maxQuantity ?? null,
          status: "ENABLED",
        },
      });
    },

    updateTraderRule: async (
      id: string,
      userId: string,
      input: UpdateTraderRuleInput,
    ): Promise<TraderRule | null> => {
      const existing = await prisma.traderRule.findFirst({
        where: { id, userId },
      });
      if (!existing) return null;

      return prisma.traderRule.update({
        where: { id },
        data: {
          ...(input.side !== undefined ? { side: input.side } : {}),
          ...(input.minQuantity !== undefined
            ? { minQuantity: input.minQuantity }
            : {}),
          ...(input.alertEnabled !== undefined
            ? { alertEnabled: input.alertEnabled }
            : {}),
          ...(input.followEnabled !== undefined
            ? { followEnabled: input.followEnabled }
            : {}),
          ...(input.followDirection !== undefined
            ? { followDirection: input.followDirection }
            : {}),
          ...(input.followSizing !== undefined
            ? { followSizing: input.followSizing }
            : {}),
          ...(input.fixedQuantity !== undefined
            ? { fixedQuantity: input.fixedQuantity }
            : {}),
          ...(input.maxQuantity !== undefined
            ? { maxQuantity: input.maxQuantity }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    },

    toggleTraderRule: async (
      id: string,
      userId: string,
    ): Promise<TraderRule | null> => {
      const existing = await prisma.traderRule.findFirst({
        where: { id, userId },
      });
      if (!existing) return null;

      const nextStatus: TraderRuleStatus =
        existing.status === "ENABLED" ? "DISABLED" : "ENABLED";

      return prisma.traderRule.update({
        where: { id },
        data: { status: nextStatus },
      });
    },

    deleteTraderRule: async (id: string, userId: string): Promise<boolean> => {
      const existing = await prisma.traderRule.findFirst({
        where: { id, userId },
      });
      if (!existing) return false;

      await prisma.traderRule.delete({ where: { id } });
      return true;
    },

    listTraderRuleExecutions: async (
      userId: string,
      options?: { ruleId?: string; limit?: number },
    ): Promise<TraderRuleExecution[]> => {
      const take = Math.min(options?.limit ?? 50, 100);
      return prisma.traderRuleExecution.findMany({
        where: {
          userId,
          ...(options?.ruleId ? { ruleId: options?.ruleId } : {}),
        },
        orderBy: [{ executedAt: "desc" }],
        take,
      });
    },

    findMatchingTraderRules: async (params: FindMatchingTraderRulesParams) => {
      return prisma.traderRule.findMany({
        where: {
          traderAlias: params.traderAlias,
          trigger: params.trigger,
          status: "ENABLED",
          minQuantity: { lte: params.quantity },
          OR: [{ side: "BOTH" }, { side: params.side }],
        },
        include: {
          user: {
            select: {
              id: true,
              telegramUserId: true,
              telegramSession: {
                select: {
                  state: true,
                  connectionState: true,
                },
              },
            },
          },
        },
      });
    },

    recordTraderRuleExecution: async (
      input: RecordTraderRuleExecutionInput,
    ): Promise<TraderRuleExecution | null> => {
      const chatId =
        input.chatId !== undefined && input.chatId !== null
          ? BigInt(input.chatId)
          : null;

      try {
        return await prisma.traderRuleExecution.create({
          data: {
            ruleId: input.ruleId,
            userId: input.userId,
            traderAlias: input.traderAlias,
            trigger: input.trigger,
            eventSide: input.eventSide,
            eventQuantity: input.eventQuantity,
            eventPrice: input.eventPrice,
            sourceMessageId: input.sourceMessageId ?? null,
            chatId,
            alertStatus: input.alertStatus ?? "SKIPPED",
            followStatus: input.followStatus ?? "SKIPPED",
            followSide: input.followSide ?? null,
            followQuantity: input.followQuantity ?? null,
            followPrice: input.followPrice ?? null,
            outgoingMessageId: input.outgoingMessageId ?? null,
            errorMessage: input.errorMessage ?? null,
          },
        });
      } catch (error) {
        // Handle unique constraint violation on (ruleId, chatId, sourceMessageId)
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          return null; // Already executed for this message
        }
        throw error;
      }
    },
  };
}
