export interface SettlementAnnouncementInput {
  chatId: bigint | number;
  sourceMessageId: number;
  senderId: string;
  rawText: string;
  announcedAt: Date;
}

export interface SettlementAnnouncement {
  chatId: bigint;
  sourceMessageId: number;
  senderId: string;
  rawText: string;
  compactPrice: number;
  announcedAt: Date;
}

export const SETTLEMENT_PARSER_READY = false;

/** Fail closed until the authoritative message grammar is evidenced. */
export function parseSettlementAnnouncement(
  _input: SettlementAnnouncementInput,
): SettlementAnnouncement | null {
  return null;
}
