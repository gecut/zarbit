import type {
  ParticipantIdentityConfirmationResult,
  Store,
  TradingAction,
} from "@zarbit/db";
import type { CanonicalBotOrder } from "@zarbit/domain";

const maximumCorrelationDelayMs = 1_500;

export interface CanonicalOrderObservation {
  readonly chatId: number;
  readonly messageId: number;
  readonly observedAt: Date;
  readonly order: CanonicalBotOrder;
  readonly replyToMessageId?: number | null;
}

export type ParticipantIdentityStore = Pick<
  Store,
  | "confirmParticipantIdentity"
  | "findTradingActionForIdentityCorrelation"
  | "findCandidateActionsForIdentityCorrelation"
>;

function isExactOrderAction(action: TradingAction): boolean {
  return (
    (action.actionType === "ORDER_BUY" || action.actionType === "ORDER_SELL") &&
    action.status === "OBSERVED" &&
    action.quantity !== null &&
    action.compactPrice !== null
  );
}

/**
 * Conservative identity correlation implementing the documented 3-level hierarchy:
 * Level 1 — Direct platform relation (Telegram reply/reference)
 * Level 2 — Isolated deterministic sequence (exactly one compatible human ORDER action)
 * Level 3 — Ambiguous (multiple candidates or ambiguous orders -> no identity evidence)
 */
export async function resolveParticipantIdentity(
  store: ParticipantIdentityStore,
  canonical: CanonicalOrderObservation,
  botSenderId?: string,
): Promise<ParticipantIdentityConfirmationResult | null> {
  const expectedActionType =
    canonical.order.side === "BUY" ? "ORDER_BUY" : "ORDER_SELL";

  // Level 1 — Direct platform relation (replyToMessageId)
  if (
    canonical.replyToMessageId !== undefined &&
    canonical.replyToMessageId !== null
  ) {
    const action = await store.findTradingActionForIdentityCorrelation(
      canonical.chatId,
      canonical.replyToMessageId,
    );

    if (!action) {
      return null;
    }

    const delayMs =
      canonical.observedAt.getTime() - action.observedAt.getTime();

    if (
      BigInt(canonical.chatId) !== action.chatId ||
      (botSenderId !== undefined && action.senderId === botSenderId) ||
      action.sourceMessageId >= canonical.messageId ||
      delayMs < 0 ||
      delayMs > maximumCorrelationDelayMs ||
      !isExactOrderAction(action) ||
      action.actionType !== expectedActionType ||
      action.quantity !== canonical.order.quantity ||
      action.compactPrice !== canonical.order.compactPrice ||
      (action.participantId !== null &&
        action.participantId !== canonical.order.participantAlias) ||
      (action.confirmedByMessageId !== null &&
        action.confirmedByMessageId !== canonical.messageId)
    ) {
      return null;
    }

    return store.confirmParticipantIdentity({
      chatId: action.chatId,
      sourceMessageId: action.sourceMessageId,
      canonicalMessageId: canonical.messageId,
      participantId: canonical.order.participantAlias,
      senderId: action.senderId,
      actionType: expectedActionType,
      quantity: canonical.order.quantity,
      compactPrice: canonical.order.compactPrice,
      confirmedAt: canonical.observedAt,
    });
  }

  // Level 2 — Isolated deterministic sequence
  const windowStart = new Date(
    canonical.observedAt.getTime() - maximumCorrelationDelayMs,
  );
  const windowEnd = canonical.observedAt;

  const candidates = await store.findCandidateActionsForIdentityCorrelation(
    canonical.chatId,
    windowStart,
    windowEnd,
    canonical.messageId,
  );

  const humanCandidates =
    botSenderId !== undefined
      ? candidates.filter((c) => c.senderId !== botSenderId)
      : candidates;

  const sameSideActions = humanCandidates.filter(
    (c) => c.actionType === expectedActionType,
  );

  // If any in-flight order with the same side is ambiguous, reject correlation
  const hasAmbiguousAction = sameSideActions.some(
    (c) =>
      c.status === "AMBIGUOUS" ||
      c.quantity === null ||
      c.compactPrice === null,
  );
  if (hasAmbiguousAction) {
    return null;
  }

  // Filter for exact compatible human actions
  const compatibleActions = sameSideActions.filter(
    (c) =>
      isExactOrderAction(c) &&
      c.quantity === canonical.order.quantity &&
      c.compactPrice === canonical.order.compactPrice &&
      (c.confirmedByMessageId === null ||
        c.confirmedByMessageId === canonical.messageId) &&
      (c.participantId === null ||
        c.participantId === canonical.order.participantAlias),
  );

  if (compatibleActions.length === 0) {
    return null;
  }

  if (compatibleActions.length > 1) {
    // Level 3 — Ambiguous: competing compatible actions in flight
    return null;
  }

  const action = compatibleActions[0]!;
  const delayMs = canonical.observedAt.getTime() - action.observedAt.getTime();

  if (
    BigInt(canonical.chatId) !== action.chatId ||
    action.sourceMessageId >= canonical.messageId ||
    delayMs < 0 ||
    delayMs > maximumCorrelationDelayMs
  ) {
    return null;
  }

  return store.confirmParticipantIdentity({
    chatId: action.chatId,
    sourceMessageId: action.sourceMessageId,
    canonicalMessageId: canonical.messageId,
    participantId: canonical.order.participantAlias,
    senderId: action.senderId,
    actionType: expectedActionType,
    quantity: canonical.order.quantity,
    compactPrice: canonical.order.compactPrice,
    confirmedAt: canonical.observedAt,
  });
}
