export interface SettlementParticipantPosition {
  participantId: string;
  buyUnits: number;
  sellUnits: number;
}

export interface SettlementSyntheticTrade {
  participantId: string;
  side: "BUY" | "SELL";
  quantity: number;
  compactPrice: number;
}

export function calculateSettlementTrades(
  positions: readonly SettlementParticipantPosition[],
  compactPrice: number,
): SettlementSyntheticTrade[] {
  if (
    !Number.isInteger(compactPrice) ||
    compactPrice <= 0 ||
    compactPrice > 2_147_483_647
  ) {
    throw new Error(
      "Settlement compact price must be a positive PostgreSQL integer",
    );
  }
  const seen = new Set<string>();
  const trades: SettlementSyntheticTrade[] = [];
  for (const position of positions) {
    if (
      !position.participantId ||
      seen.has(position.participantId) ||
      ![position.buyUnits, position.sellUnits].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      throw new Error("Invalid or duplicate settlement participant position");
    }
    seen.add(position.participantId);
    const netPosition = position.buyUnits - position.sellUnits;
    if (Math.abs(netPosition) > 2_147_483_647)
      throw new Error("Settlement quantity exceeds storage range");
    if (netPosition === 0) continue;
    trades.push({
      participantId: position.participantId,
      side: netPosition > 0 ? "SELL" : "BUY",
      quantity: Math.abs(netPosition),
      compactPrice,
    });
  }
  return trades.sort((a, b) =>
    a.participantId < b.participantId
      ? -1
      : a.participantId > b.participantId
        ? 1
        : 0,
  );
}
