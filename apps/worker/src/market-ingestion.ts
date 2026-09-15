import type { Store } from "@zarbit/db";

import type { QuoteEvent } from "./transport";
import { sessionRef, workerLog } from "./logger";
import { BoundedMessageDeduplicator } from "./message-deduplicator";
import { BoundedOrderCache } from "./order-cache";
import {
  resolveParticipantIdentity,
  type CanonicalOrderObservation,
} from "./participant-identity";
import { createAuthoritativeHandler } from "./authoritative-handler";
import { createTradingActionHandler } from "./trading-action-handler";

export type MarketDataStore = Pick<Store, "recordQuote"> &
  Partial<Pick<Store, "recordTrade">> &
  Partial<Pick<Store, "recordTradingAction">> &
  Partial<
    Pick<
      Store,
      | "confirmParticipantIdentity"
      | "findTradingActionForIdentityCorrelation"
      | "findCandidateActionsForIdentityCorrelation"
    >
  > &
  Partial<Pick<Store, "latestQuote">>;

export function createMarketIngestion(
  store: MarketDataStore,
  config: { groupId: number; senderId: string },
  onTradeRecorded?: () => void,
) {
  const deduplicator = new BoundedMessageDeduplicator(2_000);
  const activeOrders = new BoundedOrderCache(2_000);
  let latestCompactQuote: number | null = null;

  if (store.latestQuote) {
    void store
      .latestQuote()
      .then((latest) => {
        if (latest && latestCompactQuote === null) {
          latestCompactQuote = latest.compactQuote;
        }
      })
      .catch(() => {
        // Startup quote lookup is non-blocking.
      });
  }

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
        workerLog.warn("telegram.participant_identity.conflict", {
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
    onQuoteRecorded: (compactQuote) => {
      latestCompactQuote = compactQuote;
    },
    onTradeRecorded,
  });

  const tradingActionHandler = createTradingActionHandler({
    store,
    deduplicator,
    activeOrders,
    resolveIdentity,
    getLatestCompactQuote: () => latestCompactQuote,
  });

  return async (userId: string, _revision: number, event: QuoteEvent) => {
    if (event.chatId !== config.groupId) {
      workerLog.debug("telegram.quote.ignored", {
        reason: "unexpected_source",
        sessionRef: sessionRef(userId),
      });
      return;
    }

    const seenKind = deduplicator.has(event.messageId);
    if (seenKind === "quote") {
      workerLog.info("telegram.quote.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (seenKind === "trade") {
      workerLog.info("telegram.trade.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }
    if (seenKind === "action") {
      workerLog.info("telegram.action.duplicate", {
        chatId: event.chatId,
        messageId: event.messageId,
        sessionRef: sessionRef(userId),
      });
      return;
    }

    if (event.senderId === config.senderId) {
      await authoritativeHandler(userId, event);
    } else {
      await tradingActionHandler(userId, event);
    }
  };
}

// Backward compatibility alias for transition
export const createQuoteRecorder = createMarketIngestion;
