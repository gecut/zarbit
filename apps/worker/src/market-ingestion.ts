import type { Store } from "@zarbit/db";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";
import { BoundedMessageDeduplicator } from "./message-deduplicator";
import { KeyedSingleFlight } from "./keyed-single-flight";
import { BoundedOrderCache } from "./order-cache";
import {
  resolveParticipantIdentity,
  type CanonicalOrderObservation,
} from "./participant-identity";
import { createAuthoritativeHandler } from "./authoritative-handler";
import { createTradingActionHandler } from "./trading-action-handler";
import type { createTraderRuleProcessor } from "./trader-rule-processor";

export type MarketDataStore = Pick<Store, "recordQuote"> &
  Partial<Pick<Store, "recordTrade">> &
  Partial<Pick<Store, "recordTradingAction">> &
  Partial<
    Pick<
      Store,
      | "confirmParticipantIdentity"
      | "findTradingActionForIdentityCorrelation"
      | "findCandidateActionsForIdentityCorrelation"
      | "quoteBeforeMessage"
    >
  > &
  Partial<Pick<Store, "latestQuote">>;

export function createMarketIngestion(
  store: MarketDataStore,
  config: { groupId: number; senderId: string },
  onTradeRecorded?: () => void,
  traderRuleProcessor?: ReturnType<typeof createTraderRuleProcessor>,
) {
  const deduplicator = new BoundedMessageDeduplicator(2_000);
  const singleFlight = new KeyedSingleFlight();
  const activeOrders = new BoundedOrderCache(2_000);

  const resolveIdentity = async (canonical: CanonicalOrderObservation) => {
    if (
      !store.confirmParticipantIdentity ||
      !store.findCandidateActionsForIdentityCorrelation
    ) {
      return;
    }

    try {
      const result = await resolveParticipantIdentity(
        {
          confirmParticipantIdentity: store.confirmParticipantIdentity,
          findTradingActionForIdentityCorrelation:
            store.findTradingActionForIdentityCorrelation ?? (async () => null),
          findCandidateActionsForIdentityCorrelation:
            store.findCandidateActionsForIdentityCorrelation,
        },
        canonical,
        config.senderId,
      );

      if (!result || result.outcome === "rejected") {
        workerLog.info(
          "telegram.participant_identity.ambiguous_correlation_ignored",
          {
            canonicalMessageId: canonical.messageId,
            chatId: canonical.chatId,
            participantAlias: canonical.order.participantAlias,
          },
        );
        return;
      }

      if (result.outcome === "duplicate") {
        workerLog.debug("telegram.participant_identity.duplicate", {
          canonicalMessageId: canonical.messageId,
          chatId: canonical.chatId,
          participantAlias: canonical.order.participantAlias,
        });
        return;
      }

      if (result.outcome === "confirmed") {
        workerLog.info("telegram.participant_identity.evidence_accepted", {
          canonicalMessageId: canonical.messageId,
          chatId: canonical.chatId,
          confirmationCount: result.confirmationCount,
          participantAlias: canonical.order.participantAlias,
          verified: result.verified,
        });
        if (result.verified) {
          workerLog.info(
            "telegram.participant_identity.verification_completed",
            {
              canonicalMessageId: canonical.messageId,
              chatId: canonical.chatId,
              confirmationCount: result.confirmationCount,
              participantAlias: canonical.order.participantAlias,
            },
          );
        }
        return;
      }

      if (result.outcome === "conflict") {
        workerLog.debug("telegram.participant_identity.conflict", {
          canonicalMessageId: canonical.messageId,
          chatId: canonical.chatId,
          participantAlias: canonical.order.participantAlias,
          resolutionStatus: result.resolutionStatus,
        });
        return;
      }
    } catch (error) {
      workerLog.failure("telegram.participant_identity.failed", error, {
        canonicalMessageId: canonical.messageId,
        chatId: canonical.chatId,
        participantAlias: canonical.order.participantAlias,
      });
    }
  };

  const authoritativeHandler = createAuthoritativeHandler({
    store,
    deduplicator,
    activeOrders,
    resolveIdentity,
    onTradeRecorded,
    traderRuleProcessor,
  });

  const tradingActionHandler = createTradingActionHandler({
    store,
    deduplicator,
    activeOrders,
    resolveIdentity,
  });

  return async (userId: string, _revision: number, event: QuoteEvent) => {
    if (event.chatId !== config.groupId) {
      workerLog.debug("telegram.quote.ignored", {
        reason: "unexpected_source",
        sessionRef: sessionRef(userId),
      });
      return;
    }

    const seenKind = deduplicator.has(event.messageId, event.chatId);
    if (seenKind === "quote") {
      workerLog.debug("telegram.quote.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (seenKind === "trade") {
      workerLog.debug("telegram.trade.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (seenKind === "action") {
      workerLog.debug("telegram.action.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (seenKind === "order") {
      workerLog.debug("telegram.order.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    const messageKey = BoundedMessageDeduplicator.key(
      event.chatId,
      event.messageId,
    );

    await singleFlight.execute(
      messageKey,
      async () => {
        if (event.senderId === config.senderId) {
          await authoritativeHandler(userId, event);
        } else {
          await tradingActionHandler(userId, event);
        }
      },
      () => {
        workerLog.debug("telegram.message.duplicate", {
          chatId: event.chatId,
          messageId: event.messageId,
          sessionRef: sessionRef(userId),
          coalesced: true,
        });
      },
    );
  };
}

// Backward compatibility alias for transition
export const createQuoteRecorder = createMarketIngestion;
