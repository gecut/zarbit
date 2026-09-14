# Zarbit — Business Rules

## Quote and market data

- **Authoritative Quote Source**: Canonical bot quote messages (`🟡 مظنه: <number> 🟡`) from the group management bot serve as the authoritative persisted quote source in `QuoteHistory`. The parser normalizes Persian/Arabic digits, grouped commas, and whitespace.
- **Authoritative Trade Source**: Trades exist strictly upon observing authoritative bot receipts (`حواله`). Canonical order messages (`🔵 ... / 🔴 ...`) represent active liquidity only and are never treated as confirmed trades.
- **Permanent Retention**: `Trade` and `QuoteHistory` records are permanently retained in PostgreSQL. The rolling 7-day window is an analytics query filter, never a data pruning boundary.
- **Reference Numbers**: Empirical group data proves receipt reference numbers (`شماره حواله`) are not globally unique. The database primary key constraint is `UNIQUE(chatId, sourceMessageId)`. Reference numbers are stored as searchable metadata.

## Financial calculations and conversions

- **Canonical Multiplier**: Compact prices convert to nominal Tomans via:
  $$\text{Nominal Tomans} = \text{compactPrice} \times 1000$$
  For example, `105020` represents `105,020,000 تومان`.
- **Storage and APIs**: Database columns (`QuoteHistory.compactQuote`, `Trade.compactPrice`, `Request.targetPrice`), API contracts, and internal calculations remain in compact integer format.
- **Realized P&L**: Analytics tracks realized profit and loss in compact price points (`realizedPnlPoints`), rounded to 2 decimal places using `roundAnalyticsPoints`. Nominal P&L in Tomans is computed as `realizedPnlPoints × 1000`.

## 7-day participant analytics and accounting engine

- **Rolling 7-Day Window**: Analytics queries filter trades within $[t - 7\text{ days}, t]$.
- **FIFO Inventory Accounting**:
  1. Historical trades prior to the 7-day window start are replayed from inception using FIFO matching to establish the participant's opening position (`netQuantity`) and `costBasis`.
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

1. Official Quote comes only from `QuoteHistory`; completed Trade comes only from an authoritative receipt in `Trade`.
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
