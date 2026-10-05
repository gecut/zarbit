import { normalizeProtocolText } from "./normalize";

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

export const SETTLEMENT_PARSER_READY = true;

const SETTLEMENT_HEADER_REGEX =
  /(?:✅|\u{2705}|[✔✓])?\s*تسویه\s*(?:با\s*موفقیت\s*انجام\s*شد|انجام\s*شد)(?:\s*(?:✅|\u{2705}|[✔✓]|\.))*/u;

const SETTLEMENT_PRICE_REGEX =
  /(?:💰|\u{1F4B0})?\s*مبلغ\s*تسویه\s*:\s*([\d,٬]+)(?:\s*(?:💰|\u{1F4B0}))?/u;

/**
 * Parses authoritative group settlement announcements.
 *
 * Example format:
 * ✅ تسویه با موفقیت انجام شد.
 * 💰 مبلغ تسویه: 113670000
 * 📅 تاریخ: 1405/07/11 - 13:31:40
 */
export function parseSettlementAnnouncement(
  input: SettlementAnnouncementInput,
): SettlementAnnouncement | null {
  if (!input.rawText || typeof input.rawText !== "string") {
    return null;
  }

  const normalized = normalizeProtocolText(input.rawText);

  if (!SETTLEMENT_HEADER_REGEX.test(normalized)) {
    return null;
  }

  const match = SETTLEMENT_PRICE_REGEX.exec(normalized);
  if (!match?.[1]) {
    return null;
  }

  const rawPriceText = match[1].replace(/[,٬]/g, "");
  const rawNominalPrice = Number(rawPriceText);

  if (
    !Number.isSafeInteger(rawNominalPrice) ||
    rawNominalPrice <= 0 ||
    rawNominalPrice % 1000 !== 0
  ) {
    return null;
  }

  const compactPrice = Math.floor(rawNominalPrice / 1000);
  if (compactPrice <= 0 || compactPrice > 2_147_483_647) {
    return null;
  }

  return {
    chatId: BigInt(input.chatId),
    sourceMessageId: input.sourceMessageId,
    senderId: input.senderId,
    rawText: input.rawText,
    compactPrice,
    announcedAt: input.announcedAt,
  };
}
