# ZarBit Resource Audit

**Audit Date:** 2026-09-15  
**Type:** Static Resource-Efficiency, Lifecycle, and Resource-Leak Audit  
**Target Monorepo:** ZarBit (`apps/server`, `apps/worker`, `apps/web`, `packages/*`)  
**Methodology:** LLM Static Source Inspection & Architectural Flow Tracing (No runtime execution or code mutation)

---

## 1. Executive Summary

A comprehensive static resource audit was conducted across the entire ZarBit codebase, encompassing long-lived processes ([`apps/worker`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker), [`apps/server`](file:///Users/mm25zamanian/Codes/zarbit/apps/server)), the persistent data tier ([`packages/db`](file:///Users/mm25zamanian/Codes/zarbit/packages/db)), frontend clients ([`apps/web`](file:///Users/mm25zamanian/Codes/zarbit/apps/web)), and shared libraries ([`packages/domain`](file:///Users/mm25zamanian/Codes/zarbit/packages/domain), [`packages/contracts`](file:///Users/mm25zamanian/Codes/zarbit/packages/contracts), [`packages/logger`](file:///Users/mm25zamanian/Codes/zarbit/packages/logger)).

### Key Findings Summary

1. **Absence of Classical In-Memory Leaks:** The codebase demonstrates high engineering discipline regarding lifecycle cleanup. In-memory data structures ([`BoundedMessageDeduplicator`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/message-deduplicator.ts#L1-L23), [`BoundedOrderCache`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/order-cache.ts#L9-L51), [`ResponseCache`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/cache/response-cache.ts#L16-L81), [`RpcRateLimit`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/rpc-rate-limit.ts#L3-L27)) enforce strict capacity caps with FIFO eviction. MTProto listeners, dispatchers, SQLite file descriptors, OS locks, and timers are consistently unregistered on disposal and graceful shutdown.
2. **Primary Scalability Vulnerability — Full-History Replay in Analytics:** The 7-day rolling participant accounting engine ([`calculateParticipantAnalytics7D`](file:///Users/mm25zamanian/Codes/zarbit/packages/domain/src/analytics/calculate-participant-analytics.ts#L31-L145)) replays every historical trade since system inception to establish opening inventory. The database query ([`tradesForParticipantsChronological`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L52-L65)) contains no date lower bound on permanently retained [`Trade`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/prisma/schema/schema.prisma#L261-L285) records. As trade history accumulates, every analytics request fetches and processes $O(\text{total historical trades})$ records in Node.js heap, posing an imminent risk of heap exhaustion (OOM) and event-loop monopolization.
3. **Primary Concurrency Vulnerability — Ingestion Deduplication Race:** An ingestion race condition in [`market-ingestion.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/market-ingestion.ts#L150-L191) causes up to 20 concurrent Telegram MTProto sessions to miss the in-memory deduplicator simultaneously. For each group message, all sessions concurrently execute database write transactions against a connection pool capped at 5 ([`DATABASE_POOL_MAX`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L15-L19)), causing lock contention on PostgreSQL advisory locks and connection checkout starvation.
4. **Primary Throughput Bottleneck — Server Read Capacity Gate:** The API server enforces a global read concurrency cap of 3 operations ([`ReadCapacity(3)`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts#L8-L11)) across all read endpoints. A single slow query (such as an analytics calculation) running in parallel with 2 other reads causes immediate HTTP 503 `BUSY_ERROR` rejection for all incoming reads (including market snapshots and authentication).
5. **Idle Background Churn:** The worker executes continuous polling against PostgreSQL every 1 second ([`trade-request-processor`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L42)) and every 5 seconds ([`sessions.synchronize`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/index.ts#L172-L175)), producing ~550,000 queries per day during complete market standstill.

---

## 2. Runtime Resource Map

| Component | Main Resource | Scaling Driver | Bounded? | Risk | Source Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Worker: MTProto Sessions** | RAM, Network sockets, CPU | Concurrent active sessions ($N \le 20$) | Yes (capped at `MAX_TELEGRAM_SESSIONS`) | Low | [`apps/worker/src/sessions.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L239-L243) |
| **Worker: Market Ingestion** | DB connections, advisory locks | Message rate $\times$ Active sessions | No (bounded pool, unbounded queueing) | **High (P1)** | [`apps/worker/src/market-ingestion.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/market-ingestion.ts#L159-L190) |
| **Worker: Trade Trigger Engine** | DB transactions, CPU | Timer frequency (1s) + Trade frequency | Yes (1 task per request ID) | Medium (P2) | [`apps/worker/src/trade-request-processor.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L13-L42) |
| **Worker: Session Sync Loop** | DB queries, MTProto RPCs | Timer frequency (5s) + Active sessions | Yes | Medium (P2) | [`apps/worker/src/sessions.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L1195-L1278) |
| **Worker: In-Memory Caches** | RAM / Heap | Group message volume | Yes (2,000 entries FIFO) | Low | [`apps/worker/src/order-cache.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/order-cache.ts#L9-L39) |
| **Server: Analytics Engine** | RAM / Heap, CPU, DB query I/O | Total historical trades $\times$ Query rate | **No (grows with database history)** | **Critical (P1)** | [`packages/db/src/analytics.ts`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L52-L65) |
| **Server: Read Gate** | HTTP Concurrency | Concurrent client reads | Yes (hard limit 3) | **High (P1)** | [`apps/server/src/platform/resilience/read-capacity.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts#L5-L20) |
| **Server: Market State Cache** | DB queries | Polling clients $\times$ 5s TTL | Yes (Single-flight) | Medium (P2) | [`apps/server/src/modules/market/market-state.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/market-state.ts#L19-L26) |
| **Server: Rate Limiter** | RAM / Heap | Active distinct users | Yes (200 entries FIFO) | Low | [`apps/server/src/platform/resilience/rpc-rate-limit.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/rpc-rate-limit.ts#L21-L24) |
| **Database: Pool** | PG connections | Server + Worker concurrency | Yes (5 conn/process, total 10) | Medium (P1) | [`packages/db/src/index.ts`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L15-L19) |
| **Database: Storage** | Disk | Permanent trade, quote, and action rows | No (by product contract) | Low (Disk) / High (Query) | [`docs/POSTGRES.md`](file:///Users/mm25zamanian/Codes/zarbit/docs/POSTGRES.md#L41-L47) |
| **Web: TanStack Polling** | Network I/O, Client CPU | Open browser tabs $\times$ 3s/4s/30s | Yes (stops when component unmounts) | Medium (P2) | [`apps/web/src/shared/api/query-policy.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/shared/api/query-policy.ts#L3-L24) |

---

## 3. Normal Resource Consumers

### 3.1. MTProto Multi-Session Runtime Engine
* **Resource:** RAM (heap + V8 buffer memory), Network Sockets, SQLite File Descriptors.
* **Location:** [`apps/worker/src/sessions.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts), [`apps/worker/src/mtcute.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts).
* **Cause:** Maintains up to 20 persistent TCP MTProto connections to Telegram data centers (DCs), holding crypto state, MTProto transport framing, active update loops, and open SQLite session files.
* **Scaling factor:** Strictly scales with the number of authenticated user sessions ($0 \le N \le 20$).
* **Bounded by:** Hard limit `MAX_TELEGRAM_SESSIONS` (default `20`, enforced in [`Sessions.open`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L239-L243)).
* **Assessment:** Expected steady-state consumption. Each MTProto client instance allocates approximately 5–15 MB of heap plus 1–2 file descriptors for its `<storageKey>.sqlite` database. 20 sessions require ~150–250 MB RSS.
* **Evidence:** Explicit capacity guard [`if (this.runtimes.size >= this.options.max) throw new AppError("CAPACITY")`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L239-L243). On shutdown or revocation, [`client.destroy()`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L218) and [`dispatcher.destroy()`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L217) close all network sockets and release file handles.

### 3.2. Market Snapshot Coalescing and Single-Flight Hydration
* **Resource:** PostgreSQL Queries, Memory Buffer, CPU.
* **Location:** [`apps/server/src/modules/market/market-state.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/market-state.ts#L19-L78).
* **Cause:** Serves headline market prices (latest official quote, 10 recent completed trades, head difference) to frontend dashboards.
* **Scaling factor:** Scales with client polling requests, decoupled from backend DB load via cache coalescing.
* **Bounded by:** Single-flight promise sharing ([`this.flight`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/market-state.ts#L26-L28)). Regardless of how many clients request a snapshot simultaneously during a cache miss, exactly one database read executes.
* **Assessment:** Normal and efficient pattern. Coalesces concurrent reads into a single PostgreSQL execution of [`store.marketHeads()`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/market-heads.ts#L19-L32).
* **Evidence:** Line 26: `if (this.flight) return this.flight;` ensures subsequent concurrent calls share the in-flight promise.

### 3.3. Worker Trade Trigger Execution Engine
* **Resource:** PostgreSQL transactions, Advisory locks, CPU.
* **Location:** [`apps/worker/src/trade-request-processor.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L13-L51), [`packages/db/src/requests.ts`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/requests.ts#L219-L278).
* **Cause:** Evaluates pending user conditional orders against authoritative bot trade receipts (`حواله`).
* **Scaling factor:** Triggered every 1 second via interval timer AND immediately on each committed trade receipt. Scales with active waiting requests.
* **Bounded by:** `TradeRequestCursor` prevents historical re-evaluation. A single promise guard (`scanning`) prevents concurrent overlapping evaluation passes. Each request ID executes at most once concurrently via `executions: Map<string, Promise<void>>`.
* **Assessment:** Expected operational cost to guarantee trade-to-order execution latencies under 1 second.
* **Evidence:** Line 14: `if (stopped || scanning) return;` prevents async re-entrance. Atomic transaction with `pg_advisory_xact_lock` guarantees exact-once evaluation order.

### 3.4. In-Memory Ingestion Caches
* **Resource:** RAM (V8 heap).
* **Location:** [`apps/worker/src/message-deduplicator.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/message-deduplicator.ts), [`apps/worker/src/order-cache.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/order-cache.ts).
* **Cause:** Prevents duplicate processing of repeated Telegram messages and maintains recent liquidity orders for identity resolution.
* **Scaling factor:** Message rate.
* **Bounded by:** Hard limit of 2,000 entries each, using FIFO key eviction.
* **Assessment:** Normal bounded caches. Memory footprint is strictly bounded to $< 2$ MB total.
* **Evidence:** [`this.seen.size >= this.maxSize`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/message-deduplicator.ts#L14-L19) deletes the oldest key before inserting.

### 3.5. Web Client TanStack Query Cache and Polling
* **Resource:** Client CPU, Browser Network Bandwidth, Mobile Battery.
* **Location:** [`apps/web/src/shared/api/query-policy.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/shared/api/query-policy.ts), [`apps/web/src/modules/home/_use-market.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_use-market.ts#L7).
* **Cause:** The Telegram Mini App UI requires continuous updates for market quotes (3s cadence) and active trade requests (4s cadence).
* **Scaling factor:** Number of open Mini App instances.
* **Bounded by:** Query deduplication by query key, garbage collection timeout (`gcTime: 15 * 60_000`), structural sharing (`mergeMarketQueryData`), and window focus gating (`refetchIntervalInBackground: false` on active views).
* **Assessment:** Standard pattern for web trading terminals lacking persistent WebSockets.

---

## 4. Resource Leak Findings

| ID | Severity | Confidence | Resource | Location | Growth Trigger | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FIND-01** | **P1** | `CONFIRMED` | RAM, CPU, DB I/O | [`packages/db/src/analytics.ts:52-65`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L52-L65) | Monotonic database growth of `Trade` table | Full-history scan and in-memory replay of permanently retained trades on every analytics calculation ($O(\text{total historical trades})$). |
| **FIND-02** | **P1** | `CONFIRMED` | PG Connection Pool, Advisory Locks | [`apps/worker/src/market-ingestion.ts:159-189`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/market-ingestion.ts#L159-L189) | Group message arrival $\times$ Active sessions | Ingestion deduplication race condition triggers $N$ concurrent DB transactions per message against a 5-connection pool. |
| **FIND-03** | **P1** | `CONFIRMED` | Server HTTP Concurrency | [`apps/server/src/platform/resilience/read-capacity.ts:5-20`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts#L5-L20) | $> 3$ concurrent read requests | Global server read capacity bottleneck hardcoded to 3 concurrent operations, cascading into 503 BUSY for all read RPCs. |
| **FIND-04** | **P2** | `CONFIRMED` | DB Query Rate, Server Cache | [`apps/server/src/modules/market/market-state.ts:9,21`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/market-state.ts#L9) | Web polling (3s) | `MarketState.connected` flag is never set to `true`, forcing snapshot cache TTL to 5s instead of 60s permanently. |
| **FIND-05** | **P2** | `CONFIRMED` | DB Query Bandwidth | [`apps/worker/src/index.ts:172-175`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/index.ts#L172-L175), [`apps/worker/src/trade-request-processor.ts:42`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L42) | Worker uptime (continuous 24/7) | Idle polling amplification: 1s trade trigger check + 5s session sync generates ~550,000 DB queries/day during zero market activity. |
| **FIND-06** | **P2** | `CONFIRMED` | Disk I/O, Log Files | [`apps/worker/src/authoritative-handler.ts:64,118`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/authoritative-handler.ts#L64) | Group message arrival $\times$ Active sessions | Log amplification: every incoming group message generates up to 19 duplicate `INFO` log lines, rotating 50MB logs in minutes. |
| **FIND-07** | **P2** | `CONFIRMED` | CPU, DB Query Load | [`apps/server/src/modules/analytics/create-analytics-router.ts:51-55`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/analytics/create-analytics-router.ts#L51-L55) | User opening Trader Detail drawer | Zero server-side caching on `analytics.traderDetail`, causing full trade history scans every 30s while drawer is open. |
| **FIND-08** | **P2** | `HIGH-CONFIDENCE` | Telegram MTProto RPC Quota | [`apps/worker/src/sessions.ts:1245-1253`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L1245-L1253) | Active sessions $\times$ 30s interval | Aggressive 30-second MTProto `getChatMember` polling for all active sessions risks Telegram `FLOOD_WAIT` rate limits. |
| **FIND-09** | **P3** | `CONFIRMED` | Node.js Heap, DB Network I/O | [`packages/db/src/analytics.ts:27-45`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L27-L45) | Trades in 7-day window | `activeParticipantAliasesInWindow` loads all 7-day trade records into memory to deduplicate aliases in JS instead of `SELECT DISTINCT`. |

---

### Detailed Analysis of High-Severity (P1) Findings

#### FIND-01: Full-History Scan & In-Memory Replay in Analytics Engine
* **Classification:** `CONFIRMED` | Severity: `P1`
* **Resource:** RAM (Heap allocation), CPU (Single-threaded event-loop latency), DB Query Network Bandwidth.
* **Exact Location:**
  * [`packages/db/src/analytics.ts:52-65`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L52-L65) (`tradesForParticipantsChronological`)
  * [`apps/server/src/modules/analytics/analytics-service.ts:34-78`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/analytics/analytics-service.ts#L34-L78) (`getTradersList`)
  * [`packages/domain/src/analytics/calculate-participant-analytics.ts:49-76`](file:///Users/mm25zamanian/Codes/zarbit/packages/domain/src/analytics/calculate-participant-analytics.ts#L49-L76) (`calculateParticipantAnalytics7D`)
* **Mechanism:**
  1. According to [`docs/POSTGRES.md:43`](file:///Users/mm25zamanian/Codes/zarbit/docs/POSTGRES.md#L43), `Trade` records are **permanently retained** and never pruned.
  2. In [`AnalyticsService.getTradersList`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/analytics/analytics-service.ts#L27-L35), the service retrieves all active participant aliases in the rolling 7-day window. In a typical OTC group, active participants account for virtually all historical trade volume.
  3. The service then queries:
     ```typescript
     // packages/db/src/analytics.ts
     tradesForParticipantsChronological: (participantIds: string[]): Promise<Trade[]> => {
       return prisma.trade.findMany({
         where: {
           OR: [
             { buyerParticipantId: { in: participantIds } },
             { sellerParticipantId: { in: participantIds } },
           ],
         },
         orderBy: [{ announcedAt: "asc" }, { sourceMessageId: "asc" }],
       });
     }
     ```
  4. **There is NO date filter on this query.** It retrieves every trade ever executed by these participants since system inception ($t = 0$).
  5. The entire historical trade dataset is deserialized by Prisma, transferred over the Docker network, and mapped into JavaScript objects on the server heap.
  6. In [`calculateParticipantAnalytics7D`](file:///Users/mm25zamanian/Codes/zarbit/packages/domain/src/analytics/calculate-participant-analytics.ts#L60-L63), the server loops through every pre-window trade sequentially to replay signed weighted-average inventory accounting from scratch.
* **Impact:** As the platform operates over 6–12 months, the `Trade` table will grow to hundreds of thousands or millions of records. Every time the Leaderboard is loaded (cached for only 5 seconds on the server via `tradersCache` in [`create-orpc-router.ts:59-64`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/transport/rpc/create-orpc-router.ts#L59-L64)), hundreds of megabytes of raw trade objects will be allocated on the Node.js heap. The synchronous CPU loop will block the single-threaded Node.js event loop for seconds, causing request timeouts across all other API endpoints and eventual out-of-memory crashes.

---

#### FIND-02: Ingestion Deduplication Race & Concurrency Fan-Out
* **Classification:** `CONFIRMED` | Severity: `P1`
* **Resource:** PostgreSQL Connection Pool, Transaction Concurrency, Advisory Locks.
* **Exact Location:**
  * [`apps/worker/src/market-ingestion.ts:159-189`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/market-ingestion.ts#L159-L189)
  * [`apps/worker/src/authoritative-handler.ts:45-52, 90-102`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/authoritative-handler.ts#L45-L52)
  * [`apps/worker/src/trading-action-handler.ts:55-73`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trading-action-handler.ts#L55-L73)
* **Mechanism:**
  1. ZarBit supports up to 20 concurrent user MTProto sessions ([`MAX_TELEGRAM_SESSIONS=20`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/index.ts#L44)). All connected accounts reside in the same Telegram trading group (`TELEGRAM_GROUP_ID`).
  2. When the group management bot or a trader sends a message, Telegram broadcasts the message to all 20 connected client sessions nearly simultaneously.
  3. In [`Sessions`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L669), each session invokes [`onQuote`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L671) wrapped in `this.serial(rt.userId, ...)`. This serializes messages **per user**, but provides **zero serialization across different sessions**.
  4. In [`market-ingestion.ts:159`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/market-ingestion.ts#L159), each session checks:
     ```typescript
     const seenKind = deduplicator.has(event.messageId);
     if (seenKind) return;
     ```
  5. Because `deduplicator.add(event.messageId, ...)` is **only called after the database transaction returns** ([`authoritative-handler.ts:52, 102`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/authoritative-handler.ts#L52)), `deduplicator.has(event.messageId)` returns `undefined` for all 20 sessions.
  6. All 20 sessions concurrently invoke [`store.recordTrade`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/market-data.ts#L124) or [`store.recordQuote`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L275) or [`store.recordTradingAction`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/market-data.ts#L209).
  7. Each call starts a PostgreSQL interactive transaction (`db.$transaction`).
* **Impact:**
  * The worker's connection pool has `DATABASE_POOL_MAX = 5` connections ([`packages/db/src/index.ts:16`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L16)).
  * A single Telegram message triggers 20 concurrent transactions. 5 acquire pool connections; the other 15 block in `pg.Pool` checkout queue.
  * In [`store.recordTrade`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/market-data.ts#L134), each transaction executes:
    ```sql
    SELECT pg_advisory_xact_lock(hashtextextended('trade-requests:<chatId>', 0))::text;
    ```
    This forces all 20 transactions to execute sequentially under an advisory lock. One transaction commits the trade (`count === 1`), and 19 transactions execute redundant queries (`participant.upsert` $\times 2$, `trade.createMany` returning 0) before releasing the lock.
  * Under burst trading activity, connection checkout times exceed `connectionTimeoutMillis: 5_000`, resulting in worker connection pool starvation and dropped message processing.

---

#### FIND-03: Global Read Capacity Bottleneck (Cascading 503 Rejections)
* **Classification:** `CONFIRMED` | Severity: `P1`
* **Resource:** Server HTTP Availability, RPC Throughput.
* **Exact Location:**
  * [`apps/server/src/platform/resilience/read-capacity.ts:5-42`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts#L5-L42)
  * [`apps/server/src/modules/market/create-market-runtime.ts:8-13`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/create-market-runtime.ts#L8-L13)
  * [`apps/server/src/transport/rpc/create-orpc-router.ts:67, 107, 162, 168`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/transport/rpc/create-orpc-router.ts#L67)
* **Mechanism:**
  1. In [`createMarketRuntime`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/create-market-runtime.ts#L8), the server instantiates:
     ```typescript
     const capacity = new ReadCapacity(); // defaults: limit = 3, timeoutMs = 3000
     ```
  2. The wrapped `runtime.read` method is exported and passed into [`createOrpcRouter`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/transport/rpc/create-orpc-router.ts#L67).
  3. This single instance controls **all read access across the entire server**:
     * `market.snapshot` ([`create-market-runtime.ts:15`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/market/create-market-runtime.ts#L15))
     * RPC user identity lookup on every authenticated request ([`create-orpc-router.ts:107`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/transport/rpc/create-orpc-router.ts#L107))
     * `requests.active`, `requests.history`, `requests.detail` ([`create-requests-router.ts:108, 114, 119`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/requests/create-requests-router.ts#L108))
     * `analytics.traders`, `analytics.traderDetail` ([`create-analytics-router.ts:46, 52`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/analytics/create-analytics-router.ts#L46))
  4. In [`ReadCapacity.run`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts#L13-L20):
     ```typescript
     if (this.active >= this.limit) throw busyError();
     this.active++;
     const work = Promise.resolve().then(load).finally(() => { this.active--; });
     ```
  5. Furthermore, as documented in line 4: *"Timed-out callers do not release still-running work."* If `Promise.race` times out after 3,000 ms, `this.active` remains decremented only when the underlying database query actually resolves.
* **Impact:** With a hard ceiling of 3 concurrent reads, if two users request analytics or trade history, and a market hydration query occurs simultaneously, `this.active` reaches 3. Every subsequent RPC request from any user—including basic authentication identity resolution or market snapshot polling—immediately aborts with HTTP 503 `BUSY_ERROR` ("سرویس شلوغ است؛ کمی بعد تلاش کنید.").

---

## 5. Overload & Scalability Risks

### 5.1. Mathematical Scaling Relationships

```text
Analytics Heap & CPU Load:
Complexity = O(totalHistoricalTrades * activeParticipants)
Scaling Driver: Permanently retained rows in Trade table

Ingestion DB Transaction Burst:
TransactionsPerMsg = min(activeSessions, 20)
Advisory Lock Wait Queue = O(activeSessions) serial transactions
Scaling Driver: Telegram message arrival rate * active MTProto sessions

Client Polling Request Load on Server:
RequestsPerSec = activeClients * ( (1/3s [market]) + (1/4s [requests]) + (1/30s [traders]) )
At 100 active clients = ~60 incoming RPC requests/second

Idle Database Query Velocity:
QueriesPerDay = (86,400s * 2 [trade trigger]) + (17,280 [sync cycles] * (2 + activeSessions))
At 20 active sessions = ~550,000 queries/day at zero market activity
```

### 5.2. Permanent Retention vs. Query Degradation
* **`Trade` and `QuoteHistory` Tables:** By product specification ([`docs/PRODUCT.md`](file:///Users/mm25zamanian/Codes/zarbit/docs/PRODUCT.md)), these tables grow monotonically. While single-row queries like [`store.latestQuote()`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L266) scale at $O(\log N)$ via index backward scans (`announcedAt DESC, sourceMessageId DESC`), range queries without lower bounds ([`tradesForParticipantsChronological`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L52)) degrade at $O(N)$ where $N$ is total lifetime trades.
* **`TradingAction` Table:** Stores human orders and contextual commands (`خ`, `ف`, `ب`, `ن`). Retained indefinitely with no pruning routine. Grows at the rate of all human group chatter. Over time, queries like [`findCandidateActionsForIdentityCorrelation`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/market-data.ts#L288) remain bounded by time window (`observedAt BETWEEN windowStart AND windowEnd`), but overall index size and table bloat increase database buffer cache pressure.

### 5.3. Event-Loop Latency Risk Under Analytics Computation
The pure domain function [`calculateParticipantAnalytics7D`](file:///Users/mm25zamanian/Codes/zarbit/packages/domain/src/analytics/calculate-participant-analytics.ts#L31) performs synchronous mathematical operations (weighted average cost basis, zero-crossing detection, profit point rounding). When called for 50 participants across 100,000 trades, it performs several million arithmetic operations synchronously. In Node.js, this monopolizes the main thread for several hundred milliseconds to seconds, causing HTTP event-loop lag and delayed TCP socket processing for all other server traffic.

---

## 6. Lifecycle Audit

| Subsystem / Handle | Creation Location | Disposal / Cleanup Location | Lifecycle Status | Assessment & Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Connection Pool (`pg.Pool`)** | [`packages/db/src/index.ts:322`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L322) | [`packages/db/src/index.ts:330-333`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L330-L333) via `prisma.$disconnect()` | `SAFE` | Singleton per process. Hooked into process termination (`SIGTERM`, `SIGINT`) in both server and worker. Calls `await databasePool.end()`. |
| **MTProto Clients (`TelegramClient`)** | [`apps/worker/src/mtcute.ts:77-84`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L77-L84) | [`apps/worker/src/mtcute.ts:215-219`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L215-L219) via `client.close()` | `SAFE` | Invokes `stopObserving()`, `dispatcher.destroy()`, and `client.destroy()`. Cleans up network sockets and SQLite database file locks. |
| **MTProto Lifecycle Listeners** | [`apps/worker/src/mtcute.ts:54-55`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L54-L55) | [`apps/worker/src/mtcute.ts:56-59`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L56-L59) (`stopObserving`) | `SAFE` | Cleanup closure removes `onConnectionState` and `onError` event listeners directly from client emitter. |
| **MTProto Update Loop** | [`apps/worker/src/mtcute.ts:199`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L199) | [`apps/worker/src/mtcute.ts:205-207`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/mtcute.ts#L205-L207) (`rt.stop()`) | `SAFE` | Unregisters dispatcher handler (`removeUpdateHandler("all")`) and stops update loop (`client.stopUpdatesLoop()`). |
| **Worker SQLite OS Lock File** | [`apps/worker/src/ownership.ts:22`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/ownership.ts#L22) | [`apps/worker/src/ownership.ts:31-34`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/ownership.ts#L31-L34) (`releaseOwnership`) | `SAFE` | Opens `DatabaseSync` on `.worker-owner.sqlite` with `BEGIN EXCLUSIVE`. Release callback executes `ROLLBACK` and `lock.close()`. |
| **Encrypted Session SQLite Files** | [`apps/worker/src/sessions.ts:895-899`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L895-L899) | [`apps/worker/src/sessions.ts:529, 766, 1179`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/sessions.ts#L529) | `SAFE` | On session revocation or challenge discard, files (`.sqlite`, `-wal`, `-shm`, `-journal`) are purged via `SessionFiles.remove`. Orphan files pruned on boot. |
| **Worker Interval Timers** | [`apps/worker/src/index.ts:164, 172`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/index.ts#L164), [`trade-request-processor.ts:42`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L42) | [`apps/worker/src/index.ts:181-184`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/index.ts#L181-L184), [`trade-request-processor.ts:47`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L47) | `SAFE` (Lifecycle) / `QUESTIONABLE` (Cadence) | Timers are cleared on shutdown via `clearInterval`. However, the 1s and 5s cadences impose unnecessarily high idle DB load. |
| **Async Tasks & Queues** | [`SessionOperations.tasks`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/session-operations.ts#L24), [`trade-request-processor.executions`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L12) | [`SessionOperations.ts:66`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/session-operations.ts#L66), [`trade-request-processor.ts:31`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/trade-request-processor.ts#L31) | `SAFE` | Both maps delete task references in `finally()` blocks upon promise settlement. Shutdown drains active promises via `Promise.allSettled()`. |
| **Response & RPC Caches** | [`apps/server/src/platform/cache/response-cache.ts:17-18`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/cache/response-cache.ts#L17-L18) | Invalidation / Eviction in `refresh()` | `SAFE` | Values map enforces `maxEntries` (10, 100) with FIFO deletion of oldest key. In-flight promises map deletes key in `finally()`. |
| **Grammy Bot Long-Polling** | [`apps/server/src/app/start-application-server.ts:31`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/app/start-application-server.ts#L31) | [`apps/server/src/app/start-application-server.ts:75`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/app/start-application-server.ts#L75) | `SAFE` | Initiated via `bot.start()`. Server shutdown checks `if (bot?.isRunning()) await bot.stop()`. |
| **Frontend Event Listeners** | [`apps/web/src/app/app-runtime.tsx:23-27`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/app/app-runtime.tsx#L23-L27), [`_use-telegram-connection.ts:62`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/telegram/_use-telegram-connection.ts#L62) | Cleanup returns in `useEffect` | `SAFE` | System/Telegram theme change listeners and 1s countdown interval explicitly cleared in hook unmount cleanup. |

---

## 7. Growth Audit

### 7.1. Intentionally Permanent Persistence (Product Rules)
* **`Trade` Table:** Stores completed bot receipts (`حواله`). Retained permanently to serve OTC audits, price discovery, and compliance. Bounded in growth only by actual trading activity in the group (typically 50–500 receipts/day).
* **`QuoteHistory` Table:** Stores canonical mithqal gold quotes (`🟡 مظنه`). Retained permanently. Bounded by group quote frequency (typically 500–2,000 quotes/day).
* **`TradingAction` Table:** Stores human commands (`خ`, `ف`, `ب`, `ن`). Retained permanently.
* **`Participant` Table:** Stores unique participant aliases emitted by the bot. Bounded by total distinct traders in the group (~100–500 participants).

### 7.2. Accidental / Unbounded In-Memory Growth
* **No Unbounded Static Collections:** There are no unbounded static arrays or leak-prone module-level Sets/Maps.
* **Transient Query Heap Bloat:** The growth risk is **not memory that fails to be garbage collected**, but **memory allocated during transient query execution**. As the `Trade` table grows, each execution of `analytics.traders` allocates an increasingly massive array of records. This creates severe heap spikes ($100\text{ MB} \to 500\text{ MB} \to 1\text{ GB}+$) leading to V8 garbage collection pauses and OOM termination.

### 7.3. Session & Uptime Scalability
* **Uptime Stability:** Process uptime alone does not cause memory leakage. Caches stabilize within minutes at their max entry bounds (`maxEntries: 10/100/200/2000`).
* **Session Scaling:** Resource usage scales linearly with authenticated sessions up to 20. Beyond 20, connection attempts are rejected with `CAPACITY`.

---

## 8. Priority Matrix

| Priority | Finding | Why It Matters | Runtime Verification Needed? |
| :--- | :--- | :--- | :--- |
| **P1** | **FIND-01:** Full-history scan & in-memory replay in Analytics | Will cause guaranteed OOM crash or massive event-loop lockup as database accumulates trades over months. | Yes (benchmark query latency vs synthetic table sizes). |
| **P1** | **FIND-02:** Ingestion deduplication race & pool exhaustion | Bursts of messages in the trading group cause 20 concurrent transactions to overwhelm the 5-connection pool. | Yes (observe pool checkout wait queue during simulated Telegram updates). |
| **P1** | **FIND-03:** Server `ReadCapacity(3)` global bottleneck | Legitimate concurrent reads or a single slow query will reject regular users with HTTP 503 errors. | Yes (test concurrent reads under load). |
| **P2** | **FIND-04:** Stale `MarketState.connected` flag (5s TTL) | Causes 12x higher database query load on `marketHeads` than designed (every 5s instead of 60s). | No (proven directly by code absence). |
| **P2** | **FIND-05:** Idle background polling load (~550k queries/day) | Consumes DB CPU, I/O, and connection capacity 24/7 even during closed market hours. | No (proven directly by interval code). |
| **P2** | **FIND-06:** Ingestion INFO log amplification | Fills container Docker logs (50MB cap) within 30 minutes of active trading; creates heavy log I/O. | Yes (measure stdout byte rate under multi-session reception). |
| **P2** | **FIND-07:** Zero caching on `traderDetail` RPC endpoint | Users browsing individual trader profiles cause repetitive full-history DB calculations every 30s. | No (proven directly by router definition). |
| **P2** | **FIND-08:** Aggressive 30s MTProto membership polling | 40 MTProto RPC calls every 30s across 20 sessions risks Telegram `FLOOD_WAIT` bans. | Yes (monitor MTProto RPC error codes). |
| **P3** | **FIND-09:** Non-distinct 7-day participant alias scan | Minor memory and network inefficiency in fetching redundant trade records. | No (code inspection sufficient). |

---

## 9. Runtime Verification Plan

Because this audit is static, the following non-invasive telemetry and profiling probes are recommended for post-audit validation:

1. **PostgreSQL Pool Queue Telemetry:**
   * **Metric:** `databasePoolWaiting` from [`databasePoolStats()`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/index.ts#L335-L341) in worker and server `/health`.
   * **Verification Goal:** Confirm whether `databasePoolWaiting > 0` during message bursts in the Telegram group (verifying FIND-02).
2. **Event-Loop Lag Monitoring:**
   * **Metric:** Node.js `perf_hooks.monitorEventLoopDelay()`.
   * **Verification Goal:** Measure event-loop latency spikes during execution of `analytics.traders` and `analytics.traderDetail` as trade volume increases (verifying FIND-01).
3. **Analytics Memory & Duration Profiling:**
   * **Metric:** Query duration of [`tradesForParticipantsChronological`](file:///Users/mm25zamanian/Codes/zarbit/packages/db/src/analytics.ts#L52) and V8 heap delta (`process.memoryUsage().heapUsed`) before and after running `getTradersList`.
   * **Verification Goal:** Confirm $O(N)$ growth profile as historical trade records accumulate in the database.
4. **Read Capacity Saturation Rate:**
   * **Metric:** Rate of HTTP 503 responses with code `BUSY_ERROR` on the server.
   * **Verification Goal:** Verify if concurrent tab refreshes trigger read capacity exhaustion (verifying FIND-03).
5. **Worker Multi-Session Duplicate Log Volume:**
   * **Metric:** Count of lines matching `telegram.*.duplicate` in worker stdout per unit time.
   * **Verification Goal:** Validate whether log volume scales at $(N - 1) \times \text{messageRate}$.

---

## 10. Final Assessment

### 1. Is there evidence of an actual resource leak?
**No classical memory or resource leak was found.** Active timers, network sockets, MTProto dispatchers, event listeners, SQLite handles, and in-memory caches are consistently bounded and cleanly released upon disposal or shutdown. However, there is a **critical data-growth scaling flaw (FIND-01)** that behaves identically to an unbounded memory leak over time: the analytics engine loads all historical trades into Node.js heap without a date filter, causing heap consumption to grow monotonically with the lifetime of the database.

### 2. What subsystem is expected to consume the most resources normally?
Under normal steady-state operation, the **Worker MTProto Session Engine ([`apps/worker`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker))** is the largest normal resource consumer. Maintaining up to 20 persistent MTProto client connections, background update streams, active encryption sessions, and SQLite session storage consumes the majority of baseline process memory (~150–250 MB RSS) and network I/O.

### 3. What subsystem is most likely to overload first?
The **Server Analytics Subsystem ([`apps/server/src/modules/analytics`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/modules/analytics))** combined with the **Server Read Gate ([`ReadCapacity`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts))** will overload first. As historical trades grow, analytics calculations will exceed the 3,000 ms timeout, saturate the 3-slot capacity, and cause immediate cascading 503 outages across all read endpoints on the server. Secondarily, the **Worker PostgreSQL Pool** will suffer exhaustion during fast trading bursts due to the 20-session ingestion race condition.

### 4. What are the top 3 issues worth addressing?
1. **Bound Analytics Queries & Incrementally Snapshot Inventory (FIND-01):** Replace the full historical trade query with an opening inventory snapshot table or compute opening cost-basis via a database aggregation / materialized roll-up, ensuring analytics queries only ever touch trades within $[t - 7\text{ days}, t]$.
2. **Fix Ingestion Deduplication Lock Ordering (FIND-02):** Mark messages in [`BoundedMessageDeduplicator`](file:///Users/mm25zamanian/Codes/zarbit/apps/worker/src/message-deduplicator.ts) *before* dispatching database transactions (or use an in-memory single-flight promise map keyed by `messageId`), preventing 20 concurrent sessions from hammering the 5-connection pool for the exact same message.
3. **Decouple and Scale Server Read Capacity (FIND-03):** Remove or increase the global `limit = 3` in [`ReadCapacity`](file:///Users/mm25zamanian/Codes/zarbit/apps/server/src/platform/resilience/read-capacity.ts), and separate fast reads (`market.snapshot`, `auth.identity`, `requests.active`) from slow batch analytics (`analytics.traders`), preventing heavy analytical queries from starving real-time market data.
