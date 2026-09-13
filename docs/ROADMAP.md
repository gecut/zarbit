# ZarBit — Product Roadmap

> **Status:** Active Roadmap  
> **Scope:** Multi-phase product evolution from private quote dashboard to autonomous whale-following.  
> **Key Architecture Decisions:** Data collection first; ACTION COPY (not trade copy); permanent trade retention with rolling 7-day analytics windows; conservative deterministic identity resolution.

---

## 1. Strategic Vision

ZarBit transforms a high-velocity, semi-structured Persian Telegram gold trading group into a structured, low-latency market intelligence and automated trading platform.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 1: DATA COLLECTION FOUNDATION (Current)                           │
│ - Ingest QuoteHistory, Trade, TradingAction, Participant                │
│ - Authoritative bot quotes & receipts                                   │
│ - Conservative alias -> Telegram identity resolver                      │
│ - Dashboard: Latest Quote + Latest Trade Price (derived from Trade)     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 2: MARKET INTELLIGENCE & ANALYTICS (Next)                         │
│ - 7-day rolling performance analytics (Volume, Win Rate, Est. P&L)      │
│ - Leaderboard & Trader Ranking API                                      │
│ - Participant profiles & verified identity reconciliation dashboard     │
│ - Web UI: Top traders, volume stats, market depth                       │
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

## 2. Phase 1 — Data Collection Foundation (Current Focus)

Phase 1 establishes a rock-solid, tamper-proof structured data pipeline. No participant lists, leaderboards, P&L cards, or follow execution are exposed to end users.

### Phase 1A — DB, Domain & Worker Ingestion

- **Data Models:**
  - `Participant`: Canonical ID is the bot-emitted alias (`id = "سناتور"`). No `ParticipantAlias` table.
  - `TradingAction`: Ingests human trading intents (`ORDER_BUY`, `ORDER_SELL`, `TAKE_ALL`, `TAKE_QUANTITY`, `CANCEL`) with full message ID and reply context.
  - `Trade`: Created ONLY upon receipt of authoritative bot receipts (`حواله`). Reference numbers (`شماره حواله`) are indexed business metadata, not unique constraints. Unique identity is `sourceMessageId`.
  - `QuoteHistory`: Ingests official group quotes. Canonical bot quote messages (`🟡 مظنه: <price> 🟡`) replace raw publisher messages as the authoritative source.
- **Idempotent Ingestion:**
  - Multi-session worker handles concurrent observations across up to 20 user accounts using database-level `UNIQUE(sourceMessageId)` and `skipDuplicates: true`.
- **Identity Resolver:**
  - Conservative, deterministic-only alias → Telegram identity resolver.
  - No fuzzy matching, no LLM inference, no display-name guessing, no ambiguous correlation.
  - Requires $\ge 5$ distinct confirmations with zero contradictions to reach `VERIFIED`.
  - Conflicts freeze mappings and never overwrite verified records. Unresolved is always preferred to false mappings.
- **Data Retention:**
  - `Trade` records are permanently retained. No pruning.

### Phase 1B — Server & Web Dashboard Enhancement

- **Dashboard Exposure:**
  - Latest official group quote (Toman display + announcement time).
  - Latest completed trade price (Toman display + execution time), derived efficiently from `Trade` (`ORDER BY announcedAt DESC, sourceMessageId DESC LIMIT 1`).
  - No duplicate `LatestTrade` table.
- **Transport Architecture:**
  - Preserves existing 3-second oRPC polling and 1-second server response cache.
  - No WebSocket or Server-Sent Events (SSE) in this phase.
- **UI Bounds:**
  - Strictly quote and trade price card enhancements. Participants, trades, and analytics remain unexposed.

---

## 3. Phase 2 — Market Intelligence & Trader Analytics (Future)

Phase 2 builds the analytics and ranking engine on top of accumulated Phase 1 data.

### 2.1 Rolling 7-Day Performance Engine

- Trader ranking runs over a **rolling 7-day query window** (not a data retention limit).

Participant analytics confidence measures participant-observed coverage from the later of the participant's first trade and the earliest system trade. Identity resolution remains conservative and deterministic (direct reply, then one compatible action in the bounded window, otherwise ambiguous). Historical unresolved aliases and private-message orders are observability limitations; they do not authorize alias-based Follow execution.

- Metrics per `Participant`:
  - Total trade volume (units and Rial turnover).
  - Completed trade count (buys vs. sells).
  - Average execution price vs. reference quote.
  - Win rate and estimated realized P&L based on paired buy/sell receipts.
  - Activity consistency (trading days active, average trade size).

### 2.2 Leaderboards & Intelligence UI

- Leaderboard API exposing top-performing participants across 24h, 7d, and 30d rolling windows.
- Identification of high-volume market makers ("Whales").
- Operator tools to inspect identity resolution evidence and audit conflict flags.

---

## 4. Phase 3 — Action-Based Whale Following (Future)

Phase 3 introduces autonomous order copying and execution.

### 4.1 Core Invariant: Action Copy, NOT Trade Copy

- In fast-moving OTC gold groups, liquidity is consumed immediately. Waiting for a bot trade confirmation receipt (`حواله`) means the trade has **already happened**; the follower cannot enter at that price.
- Therefore, **Whale Following is ACTION COPY**:
  1. Followed whale sends raw command in Telegram (e.g. `1خ104900` or `ب` on an active offer).
  2. Worker intercepts `telegram.message.observed`, detects that `senderId` belongs to a `VERIFIED` followed whale.
  3. Worker immediately triggers an execution action for the follower (posting an order or taking remaining liquidity).
  4. Subsequent bot canonical order messages and receipts (`Trade`) are used for **post-execution validation and reconciliation**, not as the primary copy trigger.

### 4.2 Risk Management & Safeguards

- Follow budget limits and maximum open positions per follower.
- Slippage protection: Rejecting actions if the reference quote has moved beyond a configurable threshold.
- Cancellation synchronization: If the followed whale sends `ن`, immediately attempt to cancel the follower's matching active request.
- Automatic circuit breakers if identity status transitions to `CONFLICT` or session connectivity degrades.

---

## 5. Scope & Decision Matrix

| Capability                                                      |      Phase 1A       |           Phase 1B           |  Phase 2  |  Phase 3  |
| --------------------------------------------------------------- | :-----------------: | :--------------------------: | :-------: | :-------: |
| Persist `Participant`, `TradingAction`, `Trade`, `QuoteHistory` |         ✅          |              ✅              |    ✅     |    ✅     |
| Canonical Bot Quotes as Authoritative Source                    |         ✅          |              ✅              |    ✅     |    ✅     |
| Multi-Session Idempotent Ingestion                              |         ✅          |              ✅              |    ✅     |    ✅     |
| Conservative Deterministic Identity Resolver                    |         ✅          |              ✅              |    ✅     |    ✅     |
| Permanent Trade Retention                                       |         ✅          |              ✅              |    ✅     |    ✅     |
| Latest Quote & Completed Trade Price on Dashboard               |         ❌          |              ✅              |    ✅     |    ✅     |
| Existing oRPC Polling Architecture                              |         ✅          |              ✅              |    ✅     |  Review   |
| Rolling 7-Day Performance Analytics & Win Rate                  |         ❌          |              ❌              |    ✅     |    ✅     |
| Leaderboard & Participant Profiling API / UI                    |         ❌          |              ❌              |    ✅     |    ✅     |
| Action-Copy Order Execution Engine                              |         ❌          |              ❌              |    ❌     |    ✅     |
| Market SSE / Event Streaming                                    | Implemented locally | Release verification pending | Home only | No Follow |

Home Market implementation uses `market.snapshot/history/live`, transactional NOTIFY and bounded client recovery. Local validation does not close the Dokploy proxy and real Telegram release gates. The prior Future Realtime proposal is archived; ARCHITECTURE.md and RPC.md are canonical.
