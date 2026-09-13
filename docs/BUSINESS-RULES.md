# Zarbit — Business Rules

## Quote and market data

Canonical bot quote messages (`🟡 مظنه: <number> 🟡`) from the group management bot qualify as the authoritative persisted quote source. The parser accepts compact integers, including Persian/Arabic digits and grouped commas.

The database, API, requests, and Telegram messages retain the compact value, such as `105020`. Only the primary latest-quote and latest-trade figures on the dashboard display Toman formatting (e.g. `105,020,000 تومان`); other price displays remain compact. `announcedAt` is the original Telegram message date. Multiple connected sessions observe events concurrently; ingestion is idempotent via `sourceMessageId` deduplication.

Trades exist strictly upon observing authoritative bot receipts (`حواله`). Canonical order messages (`🔵 ... / 🔴 ...`) represent active liquidity only and are never treated as confirmed trades. Historical trades are retained permanently; the rolling 7-day window is an analytics query filter, not a retention limit.

Analytics uses one canonical price conversion: `compactPrice × 1000 = receipt/display price in Tomans`. Realized P&L uses the same multiplier. Compact prices remain unchanged in storage, APIs, requests, and secondary displays.

Participant confidence coverage starts at the later of the participant's first observed trade and the earliest system trade. This prevents new participants from inheriting system-wide history. `UNVERIFIED_INVENTORY` remains a reserved contract state because the public analytics and development mock surfaces expose it; the current trade replay engine does not currently produce unmatched units.

## Ownership and readiness

Mini App signature and allowlist authorize API access. MTProto login must connect the same account as the Mini App identity. Connected, group-member accounts observe group events; each observation is deduplicated at the data layer.

Participant aliases emitted by the group bot serve as canonical participant identifiers. Alias-to-Telegram-identity resolution requires deterministic platform evidence and multiple confirmations ($K \ge 5$); unresolved state is always preferred over false mapping, and conflicts never overwrite verified records.

## Product limits

Up to 20 simultaneous Telegram clients including OTP and recovery; one worker, group and group bot. Fixed environment allowlist requires restart. Phase 1 is data collection first: no public signup, portfolio, participant directory, leaderboard UI, or automated follow execution in this phase.

## Validation policy

TypeScript, production builds and native dependency checks remain automated. Real Telegram and UI acceptance is performed manually by the owner.

## Home Market invariants

- Official Quote comes only from QuoteHistory; completed Trade comes only from an authoritative receipt in Trade. Request matching continues to use the official Quote and existing freshness/claim rules.
- `tradeQuoteDifference = latest Trade compact price - latest Quote compact price`. It is a comparison of current heads, not historical slippage, profit or execution-time comparison.
- Telegram message IDs order each stream in the supported single group. Gaps are expected; event identity includes Quote/Trade type. A later Trade must not suppress a valid lower-ID Quote.
- `announcedAt` remains Telegram time. API/stream receipt and cache times do not make an old Quote fresh. Persian display uses Asia/Tehran.
- Only the two headline prices convert compact thousands of Toman to full Toman using Domain conversion. Request prices stay compact.
- Home does not implement Follow, auto-trading from Trade events, candles or a new Request model.
