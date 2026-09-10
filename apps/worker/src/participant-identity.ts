import type {
  ConfirmParticipantIdentityInput,
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
}

type ParticipantIdentityStore = Pick<Store, "confirmParticipantIdentity">;

function isExactOrderAction(action: TradingAction): boolean {
  return (
    (action.actionType === "ORDER_BUY" || action.actionType === "ORDER_SELL") &&
    action.status === "OBSERVED" &&
    action.quantity !== null &&
    action.compactPrice !== null
  );
}

/**
 * This is stricter than the protocol's isolated-sequence minimum: the bot
 * order must immediately follow the raw human order in the configured group.
 */
function toExactConfirmationInput(
  action: TradingAction,
  canonical: CanonicalOrderObservation,
): ConfirmParticipantIdentityInput | null {
  if (!isExactOrderAction(action)) return null;

  const delayMs = canonical.observedAt.getTime() - action.observedAt.getTime();
  const expectedActionType =
    canonical.order.side === "BUY" ? "ORDER_BUY" : "ORDER_SELL";

  if (
    BigInt(canonical.chatId) !== action.chatId ||
    canonical.messageId !== action.sourceMessageId + 1 ||
    delayMs < 0 ||
    delayMs > maximumCorrelationDelayMs ||
    action.actionType !== expectedActionType ||
    action.quantity !== canonical.order.quantity ||
    action.compactPrice !== canonical.order.compactPrice
  ) {
    return null;
  }

  return {
    chatId: action.chatId,
    sourceMessageId: action.sourceMessageId,
    canonicalMessageId: canonical.messageId,
    participantId: canonical.order.participantAlias,
    senderId: action.senderId,
    actionType: expectedActionType,
    quantity: canonical.order.quantity,
    compactPrice: canonical.order.compactPrice,
    confirmedAt: canonical.observedAt,
  };
}

export async function resolveParticipantIdentity(
  store: ParticipantIdentityStore,
  action: TradingAction,
  canonical: CanonicalOrderObservation,
): Promise<ParticipantIdentityConfirmationResult | null> {
  const input = toExactConfirmationInput(action, canonical);
  return input ? store.confirmParticipantIdentity(input) : null;
}
