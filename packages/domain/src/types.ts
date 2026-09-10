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
      readonly command: "TAKE_ALL_REMAINING";
      readonly executionQuantity: number | null;
    }
  | {
      readonly command: "TAKE_PARTIAL";
      readonly quantity: number;
    }
  | {
      readonly command: "CANCEL";
      readonly target: "REPLIED_ORDER" | "UNRESOLVED_TARGET";
    }
  | {
      readonly command: "QUOTE_INPUT";
      readonly rawQuoteText: string;
    };

export interface CommandContext {
  readonly hasActiveRepliedOrder?: boolean;
  readonly repliedOrderRemaining?: number;
  readonly hasRepliedToOwnOrder?: boolean;
  readonly isQuotePublisher?: boolean;
  readonly currentQuote?: number;
}

export interface PriceResolution {
  readonly resolvedCompactPrice: number;
  readonly mode: "SHORT_SUFFIX" | "FULL_COMPACT";
}

export type ClassifiedProtocolMessage =
  | { readonly kind: "CANONICAL_BOT_ORDER"; readonly order: CanonicalBotOrder }
  | { readonly kind: "CANONICAL_BOT_QUOTE"; readonly quote: CanonicalBotQuote }
  | { readonly kind: "TRADE_RECEIPT"; readonly receipt: TradeReceipt }
  | { readonly kind: "HUMAN_ORDER"; readonly order: HumanOrderIntent }
  | { readonly kind: "CONTEXT_COMMAND"; readonly command: ContextCommandIntent }
  | { readonly kind: "AMBIGUOUS"; readonly reason: string }
  | { readonly kind: "UNSUPPORTED"; readonly reason: string };
