import { createHash } from "node:crypto";
import type { Store } from "@zarbit/db";
import {
  parseCanonicalBotOrder,
  parseCanonicalBotQuote,
  parseSettlementAnnouncement,
  parseTradeReceipt,
  normalizeProtocolText,
} from "@zarbit/domain";
import type { Sessions } from "./sessions";
import type { QuoteEvent, TelegramMutation } from "./transport";
import { workerLog } from "./logger";

type Ingest = (
  userId: string,
  revision: number,
  event: QuoteEvent,
) => Promise<void>;

export function createFinancialIngestionCoordinator(
  store: Store,
  sessions: Sessions,
  config: {
    groupId: number;
    quoteSenderId: string;
    settlementSenderId?: string;
    settlementEnabled: boolean;
    settlementBootstrapMessageId?: number;
  },
  ingest: Ingest,
) {
  let pending: Promise<void> = Promise.resolve();
  let recovered = !config.settlementEnabled;
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const next = pending.catch(() => undefined).then(work);
    pending = next;
    return next;
  };
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const authoritative = (senderId: string) =>
    senderId === config.quoteSenderId ||
    (config.settlementSenderId !== undefined &&
      senderId === config.settlementSenderId);

  const process = async (
    userId: string,
    revision: number,
    event: QuoteEvent,
    catchUp = false,
  ): Promise<void> => {
    if (
      event.chatId !== config.groupId ||
      !Number.isSafeInteger(event.messageId) ||
      event.messageId <= 0
    )
      return;
    if (!authoritative(event.senderId)) {
      if (!catchUp) await ingest(userId, revision, event);
      return;
    }
    if (
      !config.settlementEnabled &&
      event.senderId === config.settlementSenderId &&
      event.senderId !== config.quoteSenderId
    )
      return;

    const trustedSettlementSender =
      config.settlementEnabled && event.senderId === config.settlementSenderId;
    const settlement = trustedSettlementSender
      ? parseSettlementAnnouncement({
          chatId: event.chatId,
          sourceMessageId: event.messageId,
          senderId: event.senderId,
          rawText: event.text,
          announcedAt: event.date,
        })
      : null;
    const receipt =
      event.senderId === config.quoteSenderId &&
      parseTradeReceipt(event.text).status === "parsed";
    const receiptCandidate =
      event.senderId === config.quoteSenderId &&
      /(?:خریدار|فروشنده|شماره\s*حواله|تعداد)\s*:/u.test(
        normalizeProtocolText(event.text),
      );
    if (!settlement && !receipt) {
      const knownMessage =
        event.senderId === config.quoteSenderId &&
        (parseCanonicalBotQuote(event.text).status === "parsed" ||
          parseCanonicalBotOrder(event.text).status === "parsed");
      if (
        knownMessage ||
        (!config.settlementEnabled &&
          !trustedSettlementSender &&
          !receiptCandidate)
      ) {
        await ingest(userId, revision, event);
        return;
      }
    }

    const payloadHash = hash(event.text);
    await store.observeFinancialMessage({
      chatId: event.chatId,
      sourceMessageId: event.messageId,
      senderId: event.senderId,
      rawText: event.text,
      eventKind: "NEW",
      payloadHash,
    });

    if (settlement) {
      await store.recordSettlement({ ...settlement, payloadHash });
      if (!catchUp) await recover(userId, revision);
    } else if (!receipt) {
      await store.flagFinancialReview(
        event.chatId,
        event.messageId,
        payloadHash,
        "UNRECOGNIZED_AUTHORITATIVE_MESSAGE",
      );
    } else {
      await ingest(userId, revision, event);
    }

    const state = await store.ingestionState(event.chatId);
    const flagged = await store.financialObservationFlagged(
      event.chatId,
      event.messageId,
      payloadHash,
    );
    if (
      !flagged &&
      (!state ||
        event.messageId > state.appliedThroughMessageId ||
        (receipt &&
          (await store.normalTradeExists(event.chatId, event.messageId))))
    ) {
      await store.completeFinancialMessage(
        event.chatId,
        event.messageId,
        payloadHash,
      );
    }
  };

  const reconcileInterval = async (
    after: number,
    before: number,
    history: QuoteEvent[],
  ) => {
    const current = new Map(history.map((event) => [event.messageId, event]));
    for (const observation of await store.financialMessagesInInterval(
      config.groupId,
      after,
      before,
    )) {
      const event = current.get(observation.sourceMessageId);
      if (
        !event ||
        event.senderId !== observation.senderId ||
        hash(event.text) !== observation.payloadHash
      ) {
        await store.observeFinancialMessage({
          chatId: config.groupId,
          sourceMessageId: observation.sourceMessageId,
          senderId: event?.senderId ?? "UNKNOWN",
          rawText: event?.text ?? null,
          eventKind: event ? "EDIT" : "DELETE",
          payloadHash: hash(event?.text ?? "DELETE"),
        });
      }
    }
  };

  const recoverWork = async (
    userId: string,
    revision: number,
  ): Promise<void> => {
    let recoveryGeneration: number | undefined;
    if (config.settlementEnabled) {
      recovered = false;
      recoveryGeneration = await store.beginFinancialRecovery(config.groupId);
      const state = await store.ingestionState(config.groupId);
      const after =
        state?.scannedThroughMessageId ||
        (config.settlementBootstrapMessageId
          ? config.settlementBootstrapMessageId - 1
          : 0);
      const head = await sessions.latestMessageId();
      if (head < after)
        throw new Error("Telegram history head precedes the durable cursor");
      if (head > after) {
        const CHUNK_SIZE = 200;
        let currentAfter = after;
        while (currentAfter < head) {
          const chunkBefore = Math.min(currentAfter + CHUNK_SIZE + 1, head + 1);
          const history = await sessions.history(currentAfter, chunkBefore);
          if (
            chunkBefore >= head + 1 &&
            !history.some((event) => event.messageId === head)
          ) {
            throw new Error("Telegram history snapshot head is unavailable");
          }
          for (const event of history) {
            if (event.messageId > currentAfter && event.messageId <= head) {
              await process(userId, revision, event, true);
            }
          }
          currentAfter = Math.min(currentAfter + CHUNK_SIZE, head);
          await store.markHistoryScanned(config.groupId, currentAfter);
          if (currentAfter < head) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }
      if (
        config.settlementBootstrapMessageId &&
        !(await store.settlementByMessage(
          config.groupId,
          config.settlementBootstrapMessageId,
        ))
      )
        throw new Error("Configured bootstrap settlement is not accepted");
    }
    const settlements = await store.pendingSettlements(config.groupId);
    const settlementIds = new Set(
      settlements.map((row) => row.sourceMessageId),
    );
    for (const observation of await store.unprocessedFinancialMessages(
      config.groupId,
    )) {
      if (settlementIds.has(observation.sourceMessageId)) continue;
      let messages: QuoteEvent[];
      try {
        messages = await sessions.history(
          observation.sourceMessageId - 1,
          observation.sourceMessageId + 1,
        );
      } catch (error) {
        await store.flagFinancialReview(
          config.groupId,
          observation.sourceMessageId,
          observation.payloadHash,
          "FINANCIAL_HISTORY_UNAVAILABLE",
        );
        throw error;
      }
      const current = messages.find(
        (message) => message.messageId === observation.sourceMessageId,
      );
      if (
        !current ||
        current.senderId !== observation.senderId ||
        hash(current.text) !== observation.payloadHash
      ) {
        await store.flagFinancialReview(
          config.groupId,
          observation.sourceMessageId,
          observation.payloadHash,
          "FINANCIAL_HISTORY_CONFLICT",
        );
        return;
      }
      await process(userId, revision, current, true);
    }
    if (!config.settlementEnabled) {
      recovered = true;
      return;
    }
    if (config.settlementEnabled) {
      for (const pending of settlements) {
        let messages: QuoteEvent[];
        try {
          messages = await sessions.history(
            pending.sourceMessageId - 1,
            pending.sourceMessageId + 1,
          );
        } catch (error) {
          await store.flagFinancialReview(
            config.groupId,
            pending.sourceMessageId,
            pending.payloadHash,
            "SETTLEMENT_HISTORY_UNAVAILABLE",
          );
          throw error;
        }
        const current = messages.find(
          (message) => message.messageId === pending.sourceMessageId,
        );
        if (
          !current ||
          current.senderId !== pending.senderId ||
          hash(current.text) !== pending.payloadHash
        ) {
          await store.observeFinancialMessage({
            chatId: config.groupId,
            sourceMessageId: pending.sourceMessageId,
            senderId: current?.senderId ?? "UNKNOWN",
            rawText: current?.text ?? null,
            eventKind: current ? "EDIT" : "DELETE",
            payloadHash: hash(current?.text ?? "DELETE"),
          });
        }
      }
    }
    let after =
      (await store.ingestionState(config.groupId))?.appliedThroughMessageId ??
      0;
    for (const settlement of settlements) {
      if (settlement.status === "REVIEW_REQUIRED" || settlement.reviewReason)
        return;
      if (settlement.sourceMessageId <= after) continue;
      if (!settlement.isBootstrap) {
        if (settlement.sourceMessageId - after <= 500) {
          try {
            const history = await sessions.history(
              after,
              settlement.sourceMessageId,
            );
            await reconcileInterval(after, settlement.sourceMessageId, history);
            for (const event of history) {
              if (
                event.messageId > after &&
                event.messageId < settlement.sourceMessageId
              )
                await process(userId, revision, event, true);
            }
          } catch {
            // bounded interval reconciliation failure is non-fatal
          }
        }
        await store.markHistoryScanned(
          config.groupId,
          settlement.sourceMessageId,
        );
        let appliedAutomatically = false;
        if (store.coverageEvidence && store.applySettlement) {
          const evidence = await store.coverageEvidence(
            config.groupId,
            after,
            settlement.sourceMessageId,
          );
          if (evidence.unresolvedCount === 0) {
            await store.applySettlement(
              config.groupId,
              settlement.sourceMessageId,
              {
                coverageDigest: evidence.digest,
                reviewedBy: "SYSTEM_AUTOMATION",
              },
            );
            appliedAutomatically = true;
            workerLog.info("telegram.settlement.applied_automatically", {
              chatId: config.groupId,
              messageId: settlement.sourceMessageId,
              observationCount: evidence.observationCount,
              tradeCount: evidence.tradeCount,
            });
          } else {
            workerLog.warn("telegram.settlement.coverage_review_required", {
              chatId: config.groupId,
              messageId: settlement.sourceMessageId,
              unresolvedCount: evidence.unresolvedCount,
            });
          }
        }
        if (!appliedAutomatically && !store.coverageEvidence) {
          workerLog.warn("telegram.settlement.coverage_review_required", {
            chatId: config.groupId,
            messageId: settlement.sourceMessageId,
          });
        }
      }
      after = settlement.sourceMessageId;
    }
    const ok = await store.completeFinancialRecovery(
      config.groupId,
      recoveryGeneration,
    );
    if (ok === false) {
      workerLog.warn("telegram.financial_recovery.generation_mismatch", {
        chatId: config.groupId,
        generation: recoveryGeneration,
      });
      throw new Error("Financial recovery generation mismatch");
    }
    for (const settlement of settlements) {
      if (settlement.isBootstrap)
        await store.applySettlement(config.groupId, settlement.sourceMessageId);
    }
    recovered = true;
  };

  let lastRecoveryFailureAt = 0;
  const RECOVERY_COOLDOWN_MS = 10_000;

  const recover = async (userId: string, revision: number): Promise<void> => {
    if (Date.now() - lastRecoveryFailureAt < RECOVERY_COOLDOWN_MS) {
      return;
    }
    try {
      await recoverWork(userId, revision);
      lastRecoveryFailureAt = 0;
    } catch (error) {
      recovered = false;
      lastRecoveryFailureAt = Date.now();
      if (config.settlementEnabled)
        await store.beginFinancialRecovery(config.groupId);
      throw error;
    }
  };

  return {
    onMessage: (userId: string, revision: number, event: QuoteEvent) =>
      enqueue(async () => {
        if (!recovered) await recover(userId, revision);
        await process(userId, revision, event);
      }),
    onMutation: (mutation: TelegramMutation) =>
      enqueue(async () => {
        const chatId =
          mutation.kind === "EDIT" ? mutation.event.chatId : mutation.chatId;
        const messageId =
          mutation.kind === "EDIT"
            ? mutation.event.messageId
            : mutation.messageId;
        if (
          chatId !== config.groupId ||
          !(await store.financialMessageKnown(chatId, messageId))
        )
          return;
        const rawText = mutation.kind === "EDIT" ? mutation.event.text : null;
        await store.observeFinancialMessage({
          chatId,
          sourceMessageId: messageId,
          senderId:
            mutation.kind === "EDIT" ? mutation.event.senderId : "UNKNOWN",
          rawText,
          eventKind: mutation.kind,
          payloadHash: hash(rawText ?? "DELETE"),
        });
      }),
    recover: (userId: string, revision: number) =>
      enqueue(() => recover(userId, revision)),
    drain: () => pending,
  };
}
