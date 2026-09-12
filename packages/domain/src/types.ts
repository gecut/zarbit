export type TradingSide = "BUY" | "SELL";

export type ParseResultStatus = "parsed" | "ambiguous" | "unsupported";

export type ParseResult<T> =
  | { status: "parsed"; data: T }
  | { status: "ambiguous"; reason: string }
  | { status: "unsupported"; reason: string };

export interface CanonicalBotOrder {
  readonly side: TradingSide;
  readonly participantAlias: string;
  readonly quantity: number;
  readonly remaining: number;
  readonly compactPrice: number;
}

export interface CanonicalBotQuote {
  readonly compactQuote: number;
}

export interface TradeReceipt {
  readonly buyerAlias: string;
  readonly sellerAlias: string;
  readonly quantity: number;
  readonly compactPrice: number;
  readonly displayedPrice: number;
  readonly rawTimeText: string;
  readonly referenceNumber: string;
}

export interface HumanOrderIntent {
  readonly side: TradingSide;
  readonly quantity: number;
  readonly rawPriceText: string;
  readonly priceKind: "FULL_COMPACT" | "SHORTHAND_SUFFIX";
  readonly resolvedCompactPrice: number | null;
}

export type ContextCommandIntent =
  | {
      readonly command: "TAKE_ALL";
    }
  | {
      readonly command: "TAKE_QUANTITY";
      readonly quantity: number;
    }
  | {
      readonly command: "CANCEL";
    };

export interface PriceResolution {
  readonly resolvedCompactPrice: number;
  readonly mode: "SHORT_SUFFIX" | "FULL_COMPACT";
}
