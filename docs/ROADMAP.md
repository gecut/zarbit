# ZarBit — Product Roadmap

> **Status:** Active Roadmap  
> **Scope:** Multi-phase product evolution from private quote dashboard to autonomous whale-following.  
> **Key Architecture Decisions:** Data collection first; ACTION COPY (not trade copy); permanent trade retention with rolling 7-day analytics windows; conservative deterministic identity resolution.

---

## 1. Strategic Vision

ZarBit transforms a high-velocity, semi-structured Persian Telegram gold trading group into a structured, low-latency market intelligence and automated trading platform.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 1: DATA COLLECTION FOUNDATION (Completed)                         │
│ - Ingest QuoteHistory, Trade, TradingAction, Participant                │
│ - Authoritative bot quotes & receipts                                   │
│ - Conservative alias -> Telegram identity resolver                      │
│ - Dashboard: Latest Quote + Latest Trade Price + Recent Trades Tape     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 2: MARKET INTELLIGENCE & ANALYTICS (Completed in Phases 10–13)    │
│ - 7-day rolling performance analytics (Volume, P&L, FIFO position)      │
│ - Leaderboard & Trader Ranking API (`analytics.traders/traderDetail`)   │
│ - Persian Leaderboard Web UI (`/traders`) with sort bar & detail drawer │
│ - Data coverage confidence badges (`HIGH`, `ESTIMATED`, `UNVERIFIED`)   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 3: ACTION-BASED WHALE FOLLOWING (Future)                          │
│ - ACTION COPY on raw TradingAction from VERIFIED Telegram identities    │
│ - Sub-second order execution via MTProto worker                         │
│ - Post-trade validation & reconciliation via bot receipts               │
│ - Risk controls: Slippage limits, position sizing, auto-cancellation    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1 — Data Collection Foundation (Completed)

Phase 1 established a structured, tamper-proof data pipeline and trading terminal.

- **Data Models**:
  - `Participant`: Canonical ID is the bot-emitted alias (`id = "سناتور"`). No `ParticipantAlias` table.
  - `TradingAction`: Ingests human trading intents (`ORDER_BUY`, `ORDER_SELL`, `TAKE_ALL`, `TAKE_QUANTITY`, `CANCEL`) with full message ID, effective side (`BUY`/`SELL`), and reply context.
  - `Trade`: Created ONLY upon receipt of authoritative bot receipts (`حواله`). Reference numbers (`شماره حواله`) are non-unique; unique identity is `(chatId, sourceMessageId)`.
  - `QuoteHistory`: Ingests official group quotes from canonical bot announcements (`🟡 مظنه: <price> 🟡`).
- **Idempotent Ingestion**:
  - Multi-session worker handles concurrent observations across up to 20 user accounts using database-level `UNIQUE` constraints and `skipDuplicates: true`.
- **Identity Resolver**:
  - Conservative, deterministic-only alias → Telegram identity resolver.
  - Requires $K \ge 5$ distinct confirmations with zero contradictions to reach `VERIFIED`.
  - Conflicts freeze mappings and never overwrite verified records.
- **Data Retention**:
  - `Trade` and `QuoteHistory` records are permanently retained.
- **Terminal Dashboard**:
  - Official gold quote with full Toman formatting, compact bank value, and announcement time.
  - Latest completed trade and recent trades tape (up to 10 trades).
  - Active requests radar with immediate force-send and cancellation actions.

---

## 3. Phase 2 — Market Intelligence & Trader Analytics (Completed)

Phase 2 built the accounting engine, ranking API, and Persian leaderboard UI.

### 2.1 Rolling 7-Day Performance Engine

- Trader rankings evaluate a **rolling 7-day query window** (`WHERE announcedAt >= NOW() - INTERVAL '7 days'`).
- FIFO inventory replay: Historical trades prior to the 7-day window establish opening position and cost basis at window start; window trades accumulate realized P&L, volumes, and trade counts.
- Financial unit multiplier: Canonical rule is $\text{compactPrice} \times 1000 = \text{Tomans}$. Realized P&L in Tomans is computed as $\text{unroundedRealizedPnlPoints} \times 100 / 4.3318 \times 1000$.
- Data coverage confidence: Evaluated from $\max(\text{earliestSystemDate}, \text{firstTradeAt})$.
  - `HIGH`: Confirmed flat-position reset (`hasZeroCrossing === true`) and full 7-day data span.
  - `ESTIMATED`: Shorter history or position has never reset to flat.
  - `UNVERIFIED_INVENTORY`: Reserved for participants with unmatched inventory.

### 2.2 Leaderboard & Intelligence UI (`/traders`)

- **oRPC Routes**: `analytics.traders` (with `sortBy`, `sortOrder`, `limit`) and `analytics.traderDetail` (with participant alias).
- **Web UI**: Persian leaderboard tab in bottom navigation dock (`/traders`):
  - Sticky sort toolbar: Sort by Realized P&L, Total Volume, Trade Count, and Average Trade Size.
  - Participant cards: Display alias, nominal P&L in Tomans, total volume, buy/sell breakdown, trade count, average trade size, observed position, cost basis, and confidence badges.
  - Trader Detail Drawer: Displays participant summary and chronological recent trades list with side, quantity, price, and counterparty.

---

## 4. Phase 3 — Action-Based Whale Following (Future)

Phase 3 introduces autonomous order copying and execution.

### 4.1 Core Invariant: Action Copy, NOT Trade Copy

- In OTC gold groups, liquidity is consumed immediately. Waiting for a bot trade confirmation receipt (`حواله`) means the trade has already happened; copying a completed trade guarantees slippage or execution failure.
- Therefore, **Whale Following is ACTION COPY**:
  1. Followed whale sends raw command in Telegram (e.g. `1خ105020` or `ب` on an active offer).
  2. Worker intercepts `telegram.message.observed`, detecting that `senderId` belongs to a `VERIFIED` followed whale.
  3. Worker immediately triggers an execution action for the follower (posting an order or taking remaining liquidity).
  4. Subsequent bot canonical order messages and receipts (`Trade`) are used for **post-execution validation and reconciliation**, not as the primary copy trigger.

### 4.2 Risk Management & Safeguards

- Follow budget limits and maximum open positions per follower.
- Slippage protection: Rejecting actions if reference quote has moved beyond a configurable threshold.
- Cancellation synchronization: If the followed whale sends `ن`, immediately attempt to cancel the follower's matching active request.
- Automatic circuit breakers if identity status transitions to `CONFLICT` or session connectivity degrades.

---

## 5. Scope & Decision Matrix

| Capability                                                      | Phase 1 | Phase 2 | Phase 3 |
| --------------------------------------------------------------- | :-----: | :-----: | :-----: |
| Persist `Participant`, `TradingAction`, `Trade`, `QuoteHistory` |   ✅    |   ✅    |   ✅    |
| Canonical Bot Quotes as Authoritative Source                    |   ✅    |   ✅    |   ✅    |
| Multi-Session Idempotent Ingestion                              |   ✅    |   ✅    |   ✅    |
| Conservative Deterministic Identity Resolver                    |   ✅    |   ✅    |   ✅    |
| Permanent Trade Retention                                       |   ✅    |   ✅    |   ✅    |
| Terminal Dashboard (Latest Quote, Trade, Recent Trades Tape)    |   ✅    |   ✅    |   ✅    |
| Request Radar & Management (`BUY`, `SELL`, `ALERT`, forceSend)  |   ✅    |   ✅    |   ✅    |
| Rolling 7-Day Performance Analytics & FIFO Inventory            |   ❌    |   ✅    |   ✅    |
| Leaderboard & Participant Profiling API (`analytics.*`)         |   ❌    |   ✅    |   ✅    |
| Leaderboard Web UI (`/traders`) & Trader Detail Drawer          |   ❌    |   ✅    |   ✅    |
| Action-Copy Order Execution Engine                              |   ❌    |   ❌    |   ✅    |
| Market Polling Transport (3-second TanStack Query)              |   ✅    |   ✅    | Review  |

The current production transport uses 3-second TanStack Query polling on `market.snapshot` with monotonic head merging. SSE / real-time streaming proposals are archived; [ARCHITECTURE.md](ARCHITECTURE.md) and [RPC.md](RPC.md) are canonical.

### Analytics monetary conversion

Each historical and new trading unit represents 100 grams of 18-karat gold.
Recorded compact prices remain 17-karat mithqal quotes. Realized monetary P&L
is `Math.round(sumOfUnroundedPoints * 100 / 4.3318 * 1000)`; negative zero becomes zero.
Sum unrounded closing P&L over the rolling window before converting; never sum
rounded per-trade amounts. API points remain unit-weighted quote differences
rounded to two decimals for display. No raw trades or schemas are rewritten.
Deploy server and web together, restart server caches, and reload existing web
tabs: older web bundles still multiply monetary P&L by 100.
