import type {
  CreateTraderRuleInput,
  TraderRuleDto,
  TraderRuleExecutionDto,
  UpdateTraderRuleInput,
} from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";
import type { TraderRule, TraderRuleExecution } from "@zarbit/db";

export interface TraderRulesRouterDependencies {
  store: AppDependencies["store"];
}

function formatTraderRule(rule: TraderRule): TraderRuleDto {
  return {
    id: rule.id,
    userId: rule.userId,
    traderAlias: rule.traderAlias,
    trigger: rule.trigger,
    side: rule.side,
    minQuantity: rule.minQuantity,
    alertEnabled: rule.alertEnabled,
    followEnabled: rule.followEnabled,
    followDirection: rule.followDirection ?? null,
    followSizing: rule.followSizing ?? null,
    fixedQuantity: rule.fixedQuantity ?? null,
    maxQuantity: rule.maxQuantity ?? null,
    status: rule.status,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function formatTraderRuleExecution(
  execution: TraderRuleExecution,
): TraderRuleExecutionDto {
  return {
    id: execution.id,
    ruleId: execution.ruleId,
    userId: execution.userId,
    traderAlias: execution.traderAlias,
    trigger: execution.trigger,
    eventSide: execution.eventSide,
    eventQuantity: execution.eventQuantity,
    eventPrice: execution.eventPrice,
    sourceMessageId: execution.sourceMessageId ?? null,
    chatId: execution.chatId !== null ? execution.chatId.toString() : null,
    alertStatus: execution.alertStatus,
    followStatus: execution.followStatus,
    followSide: execution.followSide ?? null,
    followQuantity: execution.followQuantity ?? null,
    followPrice: execution.followPrice ?? null,
    outgoingMessageId: execution.outgoingMessageId ?? null,
    errorMessage: execution.errorMessage ?? null,
    executedAt: execution.executedAt.toISOString(),
  };
}

export function createTraderRulesRouter<
  TList,
  TGet,
  TCreate,
  TUpdate,
  TToggle,
  TDelete,
  THistory,
>(
  builder: {
    list: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
        }) => Promise<TraderRuleDto[]>,
      ) => TList;
    };
    get: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string };
        }) => Promise<TraderRuleDto | null>,
      ) => TGet;
    };
    create: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: CreateTraderRuleInput;
        }) => Promise<TraderRuleDto>,
      ) => TCreate;
    };
    update: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string; data: UpdateTraderRuleInput };
        }) => Promise<TraderRuleDto | null>,
      ) => TUpdate;
    };
    toggle: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string };
        }) => Promise<TraderRuleDto | null>,
      ) => TToggle;
    };
    delete: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string };
        }) => Promise<{ success: boolean }>,
      ) => TDelete;
    };
    history: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input?: { ruleId?: string; limit?: number };
        }) => Promise<TraderRuleExecutionDto[]>,
      ) => THistory;
    };
  },
  deps: TraderRulesRouterDependencies,
): {
  list: TList;
  get: TGet;
  create: TCreate;
  update: TUpdate;
  toggle: TToggle;
  delete: TDelete;
  history: THistory;
} {
  return {
    list: builder.list.handler(async ({ context }) => {
      const rules = await deps.store.listTraderRules(context.user.id);
      return rules.map(formatTraderRule);
    }),

    get: builder.get.handler(async ({ context, input }) => {
      const rule = await deps.store.getTraderRule(input.id, context.user.id);
      return rule ? formatTraderRule(rule) : null;
    }),

    create: builder.create.handler(async ({ context, input }) => {
      const rule = await deps.store.createTraderRule(context.user.id, input);
      return formatTraderRule(rule);
    }),

    update: builder.update.handler(async ({ context, input }) => {
      const rule = await deps.store.updateTraderRule(
        input.id,
        context.user.id,
        input.data,
      );
      return rule ? formatTraderRule(rule) : null;
    }),

    toggle: builder.toggle.handler(async ({ context, input }) => {
      const rule = await deps.store.toggleTraderRule(input.id, context.user.id);
      return rule ? formatTraderRule(rule) : null;
    }),

    delete: builder.delete.handler(async ({ context, input }) => {
      const success = await deps.store.deleteTraderRule(
        input.id,
        context.user.id,
      );
      return { success };
    }),

    history: builder.history.handler(async ({ context, input }) => {
      const executions = await deps.store.listTraderRuleExecutions(
        context.user.id,
        input,
      );
      return executions.map(formatTraderRuleExecution);
    }),
  };
}
