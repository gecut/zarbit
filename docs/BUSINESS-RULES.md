# Zarbit — Business Rules

## Quote and market data

- **Authoritative Quote Source**: Canonical bot quote messages (`🟡 مظنه: <number> 🟡`) from the group management bot serve as the authoritative persisted quote source in `QuoteHistory`. The parser normalizes Persian/Arabic digits, grouped commas, and whitespace.
- **Authoritative Trade Source**: `NORMAL` trades come from authoritative bot receipts (`حواله`). `SETTLEMENT` trades are synthetic accounting closes created only after an accepted settlement announcement and reviewed receipt coverage. Canonical orders represent active liquidity and are never confirmed trades.
- **Permanent Retention**: `Trade` and `QuoteHistory` records are permanently retained in PostgreSQL. The rolling 7-day window is an analytics query filter, never a data pruning boundary.
- **Reference Numbers**: Empirical group data proves receipt reference numbers (`شماره حواله`) are not globally unique. The database primary key constraint is `UNIQUE(chatId, sourceMessageId)`. Reference numbers are stored as searchable metadata.

## Financial calculations and conversions

- **Canonical Multiplier**: Compact prices convert to nominal Tomans via:
  $$\text{Nominal Tomans} = \text{compactPrice} \times 1000$$
  For example, `105020` represents `105,020,000 تومان`.
- **Storage and APIs**: Database columns (`QuoteHistory.compactQuote`, `Trade.compactPrice`, `Request.targetPrice`), API contracts, and internal calculations remain in compact integer format.
- **Realized P&L**: Analytics tracks realized profit and loss in compact price points (`realizedPnlPoints`), rounded to 2 decimal places using `roundAnalyticsPoints`. Nominal P&L in Tomans is computed as `unroundedRealizedPnlPoints × 100 / 4.3318 × 1000`.

## 7-day participant analytics and accounting engine

- **Rolling 7-Day Window**: Analytics queries filter trades within $[t - 7\text{ days}, t]$.
- **Weighted-Average Inventory Accounting**:
  1. Historical trades prior to the 7-day window start are replayed from inception using signed weighted-average cost basis to establish the participant's opening position (`netQuantity`) and `costBasis`.
  2. Trades within the active 7-day window are replayed against the open position, accumulating `realizedPnlPoints`, `realizedPnlTomans`, buy/sell volumes, and buy/sell trade counts.
- **Data Coverage Confidence**:
  - `UNVERIFIED_INVENTORY`: Assigned if the participant has unmatched inventory units (`unmatchedUnits > 0`).
  - History start is evaluated conservatively as:
    $$\text{historyStart} = \max(\text{earliestSystemDate}, \text{firstTradeAt})$$
    This prevents newly observed participants from inheriting system-wide history.
  - `HIGH`: Requires both a documented flat-position reset (`hasZeroCrossing === true`) AND at least 7 full days of data coverage ($\text{windowEnd} - \text{historyStart} \ge 7\text{ days}$).
  - `ESTIMATED`: Assigned when history is shorter than 7 days or the participant's position has never reset to flat.

## Identity resolution rules

- **Canonical Identity**: The Persian participant alias emitted by the group bot (e.g. `سناتور`, `رسول اُف`) serves as the canonical identifier (`Participant.id`). No separate `ParticipantAlias` table is used.
- **Conservative Correlation**:
  - Direct Level 1 link (Telegram `replyToMessageId` or MTProto `text_mention` entity).
  - Level 2 link (isolated sequence within $\Delta t \le 1.5$s with exactly one candidate human action and no intervening messages).
  - Interleaved or concurrent messages (Level 3) are rejected as ambiguous evidence.
- **Threshold**: At least 5 distinct exact confirmations ($K \ge 5$) with zero contradictions are required to transition to `VERIFIED`.
- **Conflict Safety**: Verified identities are never overwritten. A contradictory observation locks the participant into `CONFLICT` (or `CONFLICT_FLAGGED` if previously verified). Unresolved status is always preferred over false attribution.

## Home terminal invariants

1. Official Quote comes only from `QuoteHistory`; market trade heads come only from `NORMAL` receipts in `Trade`. Synthetic `SETTLEMENT` trades contribute to Analytics, never market prices or request triggers.
2. `tradeQuoteDifference = latest Trade compact price - latest Quote compact price`. It reflects current head-to-head spread (premium or discount), not historical slippage or execution-time spread.
3. Message IDs strictly order each event stream. Gaps in Telegram message IDs are normal. A higher Trade message ID never suppresses a valid lower-ID Quote.
4. `announcedAt` reflects Telegram message timestamp. Receipt times and cache intervals never alter announced timestamps. All UI times format in `Asia/Tehran` with Persian digits (`fa-IR`).
5. Only headline prices on the dashboard convert compact thousands to full Tomans. Request prices remain compact.
6. Automated follow execution is not implemented in this phase.

## Product boundaries

- Access requires verified Mini App authentication and inclusion in `ALLOWED_TELEGRAM_USER_IDS`.
- Maximum 20 simultaneous Telegram client sessions per worker instance.
- Single trading group (`TELEGRAM_GROUP_ID`) and single group bot (`QUOTE_SENDER_ID`).
- Leaderboard and trader analytics UI are fully implemented; automated copy-trade execution is reserved for Phase 3.

### Analytics monetary conversion

Each historical and new trading unit represents 100 grams of 18-karat gold.
Recorded compact prices remain 17-karat mithqal quotes. Realized monetary P&L
is `Math.round(sumOfUnroundedPoints * 100 / 4.3318 * 1000)`; negative zero becomes zero.
Sum unrounded closing P&L over the rolling window before converting; never sum
rounded per-trade amounts. API points remain unit-weighted quote differences
rounded to two decimals for display. No raw trades or schemas are rewritten.
Deploy server and web together, restart server caches, and reload existing web
tabs: older web bundles still multiply monetary P&L by 100.

## Automatic request trigger

Only a confirmed `NORMAL` Trade can trigger a request. Canonical QuoteHistory remains authoritative for official-price display and shorthand parsing, but never triggers automatic requests. Requests use inclusive GTE/LTE comparisons, a 60-second freshness limit, and creation/edit fences. Before SENDING, the latest committed `NORMAL` trade must still qualify; otherwise the request returns to WAITING_TRADE. Sending uses targetPrice, not triggeredPrice. SENDING with an uncertain outcome must never be automatically retried.

See [GLOSSARY.md](GLOSSARY.md) for canonical domain terms, [README.md](README.md) for document directory, and [adr/](adr/) for underlying architectural decisions.
