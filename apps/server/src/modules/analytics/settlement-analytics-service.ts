import type { Store } from "@zarbit/db";
import {
  calculateParticipantAnalytics7D,
  ROLLING_WINDOW_MS,
  type ParticipantTrade,
} from "@zarbit/domain";
import type {
  ParticipantAnalyticsDetailV2,
  ParticipantAnalyticsSummaryV2,
  TraderListQuery,
  TraderRecentTradeV2,
} from "@zarbit/contracts";

type TradeRow = Awaited<
  ReturnType<Store["participantTradesChronological"]>
>[number];

function effectiveMessageId(row: TradeRow): number {
  const id =
    row.type === "SETTLEMENT" ? row.settlementMessageId : row.sourceMessageId;
  if (id === null)
    throw new Error("Trade has no effective Telegram message ID");
  return id;
}

function ordered(rows: TradeRow[]): TradeRow[] {
  return rows.sort(
    (a, b) =>
      Number(a.chatId - b.chatId) ||
      effectiveMessageId(a) - effectiveMessageId(b) ||
      (a.type === b.type ? 0 : a.type === "NORMAL" ? -1 : 1) ||
      a.id.localeCompare(b.id),
  );
}

function participantTrades(row: TradeRow, alias: string): ParticipantTrade[] {
  if (row.buyerParticipantId !== alias && row.sellerParticipantId !== alias) {
    throw new Error("Trade does not belong to participant");
  }
  const sides = [
    ...(row.buyerParticipantId === alias ? ["BUY" as const] : []),
    ...(row.sellerParticipantId === alias ? ["SELL" as const] : []),
  ];
  return sides.map((side) => ({
    id: row.id,
    sourceMessageId: effectiveMessageId(row),
    type: row.type,
    side,
    quantity: row.quantity,
    compactPrice: row.compactPrice,
    announcedAt: row.announcedAt,
  }));
}

function recentTrade(
  row: TradeRow,
  alias: string,
  side: ParticipantTrade["side"],
): TraderRecentTradeV2 {
  const common = {
    id: row.id,
    side,
    quantity: row.quantity,
    compactPrice: row.compactPrice,
    announcedAt: row.announcedAt.toISOString(),
  };
  if (row.type === "SETTLEMENT") {
    if (row.settlementMessageId === null)
      throw new Error("Malformed settlement trade");
    return {
      ...common,
      type: "SETTLEMENT",
      sourceMessageId: null,
      settlementMessageId: row.settlementMessageId,
      counterpartyAlias: null,
    };
  }
  const counterpartyAlias =
    row.buyerParticipantId === alias
      ? row.sellerParticipantId
      : row.buyerParticipantId;
  if (row.sourceMessageId === null || counterpartyAlias === null) {
    throw new Error("Malformed normal trade");
  }
  return {
    ...common,
    type: "NORMAL",
    sourceMessageId: row.sourceMessageId,
    settlementMessageId: null,
    counterpartyAlias,
  };
}

export class SettlementAnalyticsService {
  constructor(
    private readonly store: Store,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async context() {
    const applied = await this.store.appliedSettlements();
    const bootstrap = applied.find((row) => row.isBootstrap);
    const chatIds = new Set(applied.map((row) => String(row.chatId)));
    const state = bootstrap
      ? await this.store.ingestionState(bootstrap.chatId)
      : null;
    const verifiedBoundary = applied.find(
      (row) =>
        row.chatId === bootstrap?.chatId &&
        row.sourceMessageId === state?.coverageVerifiedThroughMessageId,
    );
    return {
      bootstrap,
      state,
      verifiedBoundary,
      singleChat: chatIds.size <= 1,
    };
  }

  private async summary(
    alias: string,
    rows: TradeRow[],
    windowStart: Date,
    windowEnd: Date,
    earliestSystemDate: Date | null,
    context: Awaited<ReturnType<SettlementAnalyticsService["context"]>>,
  ): Promise<ParticipantAnalyticsSummaryV2> {
    const trades = ordered(rows).flatMap((row) =>
      participantTrades(row, alias),
    );
    const baselineId = context.bootstrap?.sourceMessageId;
    const baselineValid = Boolean(
      context.bootstrap &&
      context.singleChat &&
      rows.every((row) => row.chatId === context.bootstrap!.chatId),
    );
    const crossesBootstrap =
      baselineValid && windowStart < context.bootstrap!.announcedAt;
    const reviewRequired = context.state?.gateStatus === "REVIEW_REQUIRED";
    const coverageVerified =
      baselineValid &&
      !reviewRequired &&
      context.state !== null &&
      context.state.coverageVerifiedThroughMessageId > 0 &&
      context.verifiedBoundary !== undefined &&
      context.verifiedBoundary.announcedAt >= windowEnd &&
      rows.every(
        (row) =>
          row.announcedAt > windowEnd ||
          effectiveMessageId(row) <=
            context.state!.coverageVerifiedThroughMessageId,
      );
    const pnlReliable = baselineValid && !crossesBootstrap && coverageVerified;
    const reason = !baselineValid
      ? "NO_VALID_BASELINE"
      : crossesBootstrap
        ? "WINDOW_CROSSES_BOOTSTRAP"
        : reviewRequired
          ? "FINANCIAL_REVIEW_REQUIRED"
          : !coverageVerified
            ? "COVERAGE_UNVERIFIED"
            : null;
    const analytics = calculateParticipantAnalytics7D({
      alias,
      allTradesChronological: trades,
      windowStart,
      windowEnd,
      earliestSystemDate: earliestSystemDate ?? undefined,
      baselineMessageId: baselineValid ? baselineId : undefined,
      coverageVerified,
      replayByMessageId: true,
    });
    const hidePnl = !baselineValid;
    const mask = (value: typeof analytics.contributions.normal) => ({
      ...value,
      realizedPnlPoints: hidePnl ? null : value.realizedPnlPoints,
      realizedPnlTomans: hidePnl ? null : value.realizedPnlTomans,
    });
    return {
      alias,
      realizedPnlPoints: hidePnl ? null : analytics.realizedPnlPoints,
      realizedPnlTomans: hidePnl ? null : analytics.realizedPnlTomans,
      totalVolume: analytics.totalVolume,
      buyVolume: analytics.buyVolume,
      sellVolume: analytics.sellVolume,
      totalTrades: analytics.totalTrades,
      buyTrades: analytics.buyTrades,
      sellTrades: analytics.sellTrades,
      averageTradeSize: analytics.averageTradeSize,
      observedPosition: analytics.observedPosition,
      currentCostBasis: analytics.currentCostBasis,
      confidence: pnlReliable ? analytics.confidence : "ESTIMATED",
      hasZeroCrossing: analytics.hasZeroCrossing,
      unmatchedUnits: analytics.unmatchedUnits,
      firstTradeAt: analytics.firstTradeAt?.toISOString() ?? null,
      contributions: {
        normal: mask(analytics.contributions.normal),
        settlement: mask(analytics.contributions.settlement),
        total: mask(analytics.contributions.total),
      },
      coverage: {
        positionBaselineValid: baselineValid,
        status: reviewRequired
          ? "REVIEW_REQUIRED"
          : coverageVerified
            ? "VERIFIED"
            : "UNKNOWN",
        pnlReliable,
        reason,
      },
    };
  }

  async getTradersList(
    query: TraderListQuery,
  ): Promise<ParticipantAnalyticsSummaryV2[]> {
    const windowEnd = this.now();
    const windowStart = new Date(windowEnd.getTime() - ROLLING_WINDOW_MS);
    const aliases = await this.store.activeParticipantAliasesInWindow(
      windowStart,
      windowEnd,
    );
    if (aliases.length === 0) return [];
    const [rows, earliest, context] = await Promise.all([
      this.store.tradesForParticipantsChronological(aliases),
      this.store.earliestTradeDate(),
      this.context(),
    ]);
    const byAlias = new Map(aliases.map((alias) => [alias, [] as TradeRow[]]));
    for (const row of rows) {
      if (row.buyerParticipantId)
        byAlias.get(row.buyerParticipantId)?.push(row);
      if (
        row.sellerParticipantId &&
        row.sellerParticipantId !== row.buyerParticipantId
      )
        byAlias.get(row.sellerParticipantId)?.push(row);
    }
    const summaries = await Promise.all(
      aliases.map((alias) =>
        this.summary(
          alias,
          byAlias.get(alias) ?? [],
          windowStart,
          windowEnd,
          earliest,
          context,
        ),
      ),
    );
    const field = {
      REALIZED_PNL: "realizedPnlPoints",
      VOLUME: "totalVolume",
      TRADE_COUNT: "totalTrades",
      AVG_TRADE_SIZE: "averageTradeSize",
    } as const;
    summaries.sort((a, b) => {
      const key = field[query.sortBy];
      const diff =
        (a[key] ?? Number.NEGATIVE_INFINITY) -
        (b[key] ?? Number.NEGATIVE_INFINITY);
      return (
        (query.sortOrder === "DESC" ? -diff : diff) ||
        a.alias.localeCompare(b.alias)
      );
    });
    return summaries.slice(0, query.limit);
  }

  async getTraderDetail(
    alias: string,
  ): Promise<ParticipantAnalyticsDetailV2 | null> {
    const rows = await this.store.participantTradesChronological(alias);
    if (rows.length === 0 && !(await this.store.participant(alias)))
      return null;
    const windowEnd = this.now();
    const windowStart = new Date(windowEnd.getTime() - ROLLING_WINDOW_MS);
    const [earliest, context] = await Promise.all([
      this.store.earliestTradeDate(),
      this.context(),
    ]);
    const sorted = ordered(rows);
    const summary = await this.summary(
      alias,
      sorted,
      windowStart,
      windowEnd,
      earliest,
      context,
    );
    return {
      summary,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      recentTrades: sorted
        .filter(
          (row) =>
            row.announcedAt >= windowStart && row.announcedAt <= windowEnd,
        )
        .flatMap((row) =>
          participantTrades(row, alias).map((trade) =>
            recentTrade(row, alias, trade.side),
          ),
        )
        .slice(-20)
        .reverse(),
    };
  }
}
