# ZarBit — Future Realtime Data Architecture

> **Status:** Proposed  
> **Scope:** Future architecture for realtime/global market data and user-scoped data  
> **Primary components:** `apps/web`, `apps/server`, `apps/worker`, `packages/contracts`, `packages/db`  
> **Last reviewed:** 2026-09-10

---

## 1. Purpose

This document defines the target communication architecture for ZarBit data.

The central decision is to treat:

- **global market data**, especially gold quotes and chart data;
- **user-scoped application data**, such as Telegram state and user requests;

as two independent data planes with different transport, caching, freshness, consistency, and failure requirements.

This is a **future architecture specification**. It does not imply that all described mechanisms already exist.

The architecture is intentionally designed for ZarBit's current scale and topology rather than copying exchange-scale infrastructure.

---

## 2. Current architectural baseline

ZarBit currently has three main runtime applications:

| Component | Responsibility |
| --- | --- |
| `apps/web` | React/Vite Mini App, HeroUI, TanStack Router/Query |
| `apps/server` | Hono API, authentication, oRPC, application reads/writes |
| `apps/worker` | Telegram MTProto clients, sessions, membership and quote ingestion |

`packages/contracts` owns shared RPC contracts and `packages/db` owns PostgreSQL access.

The supported deployment topology is intentionally small:

```text
1 Web deployment
1 Server process
1 Worker process
1 PostgreSQL database
```

No Redis, distributed locking, broker, or horizontally scaled worker topology is currently required.

Today, quote/dashboard and active-request data are both refreshed using periodic reads. Quote and active requests currently poll approximately every three seconds.

This works, but it treats two fundamentally different classes of data as if they had the same delivery requirements.

---

# 3. Core architectural decision

ZarBit SHALL separate application data into two independent planes:

```text
┌──────────────────────────────┐
│       MARKET DATA PLANE      │
├──────────────────────────────┤
│ quote.latest                 │
│ quote.chart                  │
│ quote.live                   │
└──────────────────────────────┘


┌──────────────────────────────┐
│        USER DATA PLANE       │
├──────────────────────────────┤
│ auth.identity                │
│ telegram.status              │
│ requests.active              │
│ requests.history             │
│ requests.detail              │
│ request mutations            │
│ telegram commands            │
└──────────────────────────────┘
```

The two planes MAY share:

```text
oRPC
Hono
PostgreSQL
TanStack Query
shared contracts
```

but MUST NOT be coupled into a single dashboard state, polling interval, cache lifetime, or aggregate response merely because they appear on the same screen.

---

# 4. Why the separation exists

## 4.1 Market data is global

The latest ZarBit quote represents one global market value.

A valid quote originates from the configured Telegram group and publisher and is persisted globally. Older Telegram events cannot overwrite newer values.

Therefore its topology is fundamentally:

```text
one producer state
        │
        ▼
one authoritative market state
        │
        ▼
many consumers
```

All authorized clients are interested in effectively the same market event.

---

## 4.2 User data is private

User state has a different topology:

```text
User A → State A
User B → State B
User C → State C
```

Telegram authentication, Telegram session status, active requests, history and request details belong to a verified user.

Existing RPC security already derives ownership from verified Telegram Mini App identity rather than accepting client-selected ownership.

This data therefore requires per-user:

```text
authorization
cache isolation
invalidation
rate limiting
error handling
```

Market data does not require the same ownership semantics.

---

# 5. Industry evidence

The proposed separation follows a common pattern in realtime trading systems.

Coinbase Advanced Trade exposes distinct WebSocket endpoints for:

```text
Market Data
User Order Data
```

The first distributes market activity, while the second distributes authenticated user-specific order information.

Binance similarly provides dedicated market streams and separately authenticated User Data Streams. Its market WebSocket interface supports individual and combined streams, while user streams deliver private state changes.

The useful architectural lesson for ZarBit is **not** that ZarBit needs exchange-scale WebSocket infrastructure.

The relevant pattern is:

```text
shared rapidly-changing state
        ≠
private user state
```

and:

```text
initial snapshot
      +
incremental live events
      +
reconciliation
```

is preferable to repeatedly transferring the complete state of rapidly changing data.

---

# 6. Target Market Data architecture

The future Market Data Plane SHOULD use:

```text
RPC snapshot
+
server-side event propagation
+
SSE live stream
+
periodic/reconnect reconciliation
```

Target topology:

```text
Telegram Group
      │
      ▼
apps/worker
      │
      │ validate + persist
      ▼
PostgreSQL
      │
      ├──── authoritative quote state/history
      │
      └──── NOTIFY quote_changed
                     │
                     ▼
                apps/server
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
   quote.latest             quote.live
      RPC                     SSE
          │                     │
          └──────────┬──────────┘
                     ▼
                  apps/web
```

---

# 7. Market Data contracts

The Market Data Plane SHOULD expose three independent logical capabilities.

## `quote.latest`

Purpose:

```text
authoritative current snapshot
```

Example logical output:

```json
{
  "quote": 96155,
  "announcedAt": "2026-09-10T08:42:00.000Z",
  "revision": "18423"
}
```

Characteristics:

```text
small payload
global
cheap to read
cacheable for a very short period
safe for bootstrap/recovery
```

---

## `quote.chart`

Purpose:

```text
historical/time-series snapshot
```

Characteristics:

```text
global
larger payload
changes less meaningfully than latest quote
independent cache lifetime
independent query key
not part of fast polling/live transport
```

A likely server cache lifetime is approximately:

```text
30–60 seconds
```

but the final value SHOULD be based on actual quote frequency and payload measurements rather than treated as a protocol constant.

---

## `quote.live`

Purpose:

```text
incremental notification of newly committed quote state
```

The preferred transport is **SSE through oRPC Event Iterator**.

oRPC v1 provides first-class Event Iterator/SSE support and explicitly positions it for realtime cases such as stock market data. It also supports event metadata including event IDs and reconnect using `lastEventId`.

Example logical event:

```json
{
  "quote": 96155,
  "announcedAt": "2026-09-10T08:42:00.000Z",
  "revision": "18423"
}
```

The stream SHOULD transmit new information only.

It MUST NOT continuously resend the full chart or dashboard snapshot.

---

# 8. Why SSE is preferred over WebSocket

ZarBit's market communication is almost entirely unidirectional:

```text
Server ─────────► Web
      quote events
```

Client commands already have an appropriate path:

```text
Web ─► RPC ─► Server
```

Therefore a bidirectional WebSocket transport would introduce connection management and protocol complexity without currently providing a meaningful domain capability.

SSE provides the properties required by the market plane:

```text
server → browser streaming
long-lived connection
native reconnection model
event IDs
HTTP infrastructure compatibility
simple failure semantics
```

More importantly, the existing oRPC stack already supports Event Iterator/SSE, including reconnect metadata and `lastEventId`.

Therefore SSE extends the existing RPC architecture instead of introducing an unrelated realtime stack.

---

# 9. Worker → Server propagation

The recommended inter-process signal is PostgreSQL:

```text
LISTEN / NOTIFY
```

The Worker remains responsible for:

```text
Telegram event
→ validation
→ persistence
```

After successfully committing a new quote, PostgreSQL signals that market state has changed.

Conceptually:

```text
BEGIN

persist/update quote

NOTIFY quote_changed, revision

COMMIT
```

Server maintains a listener:

```text
LISTEN quote_changed
```

and reacts by reading/publishing the authoritative state.

PostgreSQL explicitly defines `LISTEN/NOTIFY` as a simple inter-process communication mechanism for processes connected to the same database. It also recommends storing substantial state in tables rather than using the notification itself as the data store.

A notification executed inside a transaction is delivered only after successful commit.

This property is particularly useful for ZarBit:

```text
client event
must never represent
uncommitted quote state
```

---

# 10. PostgreSQL remains the source of truth

`NOTIFY` MUST NOT become the authoritative message bus or market database.

Correct model:

```text
PostgreSQL table
      =
authoritative state

NOTIFY
      =
state-change signal
```

Incorrect model:

```text
NOTIFY payload
      =
only copy of market state
```

A notification may contain only enough information to identify or order the change, for example:

```json
{
  "revision": "18423"
}
```

The Server can then read the authoritative record if required.

This makes notification loss recoverable.

---

# 11. Revision and ordering

Every quote visible to the realtime pipeline SHOULD carry a monotonic ordering identifier.

Preferred concept:

```text
revision
```

A revision MUST originate from authoritative server-side information.

Suitable examples include:

```text
Telegram source message ID
database sequence
explicit monotonic quote revision
```

Frontend timestamps MUST NOT be used as ordering authority.

Example:

```text
revision 18421
revision 18422
revision 18423
```

This enables the client to identify:

```text
duplicate event
older event
new event
potential gap
```

`announcedAt` remains the original Telegram publisher timestamp and MUST NOT be replaced by cache refresh or delivery time. The existing architecture already preserves the publisher timestamp semantics.

---

# 12. Client bootstrap

On initial Dashboard load:

```text
Web
 │
 ├── quote.latest
 ├── quote.chart
 └── quote.live subscription
```

The snapshot procedures MAY participate in the existing oRPC HTTP batching mechanism.

They MUST remain independent procedures.

Expected logical result:

```text
initial state
     │
     ├── latest snapshot
     ├── chart snapshot
     │
     └── live subscription established
```

After bootstrap, normal market freshness comes from `quote.live`.

`quote.latest` SHOULD NOT continue polling every three seconds while the live connection is healthy.

---

# 13. Chart composition

Live quote events SHOULD NOT mutate the authoritative `quote.chart` query cache directly.

Instead the Web SHOULD derive presentation state:

```text
displayChart =
merge(chartSnapshot, latestQuote)
```

Conceptually:

```text
quote.chart
95900
95980
96040

quote.latest
96120

        ↓

displayChart
95900
95980
96040
96120
```

The merge MUST deduplicate by authoritative identity/revision.

This preserves clear ownership:

```text
quote.chart cache
    =
server historical snapshot

quote.latest
    =
live head
```

It prevents a chart refetch from racing against arbitrary client-written cache modifications.

---

# 14. Chart reconciliation

The chart does not require the same freshness as the primary quote.

Recommended lifecycle:

```text
initial load
+
focus/reconnect refresh
+
optional 30–60 second reconciliation
```

A full chart reconciliation corrects:

```text
missing events
deduplication differences
ordering differences
retention changes
historical corrections
```

Realtime quote rendering therefore remains fast without requiring the complete historical dataset to be repeatedly transferred.

---

# 15. Stream recovery

Realtime delivery MUST assume temporary disconnection.

Telegram Mini Apps and mobile browsers may suspend background execution; the existing project documentation already notes that browser timers and background execution cannot be guaranteed while the Mini App is suspended or closed.

Therefore recovery is part of the normal protocol.

Expected lifecycle:

```text
quote.live connected
       │
       ▼
events
       │
connection lost
       │
       ▼
reconnect
       │
       ▼
recover/reconcile latest state
       │
       ▼
continue streaming
```

oRPC Event Iterator can associate an event ID with each event and make the reconnecting client's `lastEventId` available to the server.

However, ZarBit SHOULD NOT depend on infinite event replay.

At current scale the safe recovery mechanism is:

```text
reconnect
→ compare revision
→ obtain latest authoritative snapshot if necessary
→ continue stream
```

The database remains the recovery source.

---

# 16. LISTEN startup race

The PostgreSQL listener must be initialized correctly.

PostgreSQL documents an initial race when a process starts listening while concurrent transactions are committing notifications.

The recommended sequence is:

```text
1. LISTEN
2. commit LISTEN
3. read current authoritative state
4. process subsequent notifications
```

This ensures the Server first establishes its listening position and then obtains a state snapshot from which future notifications can be interpreted.

Duplicate initial notifications are acceptable because quote processing MUST already be idempotent by revision.

---

# 17. User Data Plane

User-scoped data remains independent from Market Data.

Examples:

```text
auth.identity
telegram.status

requests.active
requests.history
requests.detail

requests.create
requests.update
requests.cancel
requests.forceSend
```

These procedures require authenticated ownership and maintain per-user semantics. The current RPC architecture already validates Mini App identity and isolates private cache state.

There is no architectural requirement to move User Data onto the Market SSE connection.

For the current scale, polling authenticated user data where appropriate remains acceptable.

Future realtime user streams MAY be introduced independently if actual product requirements justify them.

---

# 18. Active requests and history MUST remain separate

Active and historical requests have different correctness and freshness requirements.

Active requests represent the complete set of currently executable/user-visible rules.

History represents a paginated archive.

Therefore this model is correct:

```text
requests.active
    server-filtered ACTIVE
    complete or explicitly paginated
    relatively fresh

requests.history
    terminal records
    cursor paginated
    slower freshness
```

This model is incorrect:

```text
requests.recent(limit: 24)
        ↓
frontend separates
ACTIVE / HISTORY
```

A user may have active requests older than the latest 24 terminal requests.

Limiting a mixed collection therefore cannot guarantee correctness.

The previous architecture investigation explicitly demonstrated this failure mode.

---

# 19. Request cardinality

`requests.active` currently has no explicit limit.

Before active-request volume becomes significant, the product SHOULD make one explicit decision:

```text
A. enforce MAX_ACTIVE_REQUESTS_PER_USER

or

B. implement true active-request pagination
```

For ZarBit's expected use case, a product-level maximum is preferable unless evidence shows users require a large number of simultaneously active requests.

Silent truncation is forbidden.

---

# 20. Caching model

Recommended logical server caching:

| Data | Scope | Suggested strategy |
| --- | --- | --- |
| `quote.latest` | global | very short cache, approximately 0.5–1s |
| `quote.chart` | global | approximately 30–60s |
| `quote.live` | global | event stream, not snapshot cache |
| `requests.active` | per-user | short cache + mutation invalidation |
| `requests.detail` | per-user | no server cache unless later justified |
| `requests.history` | per-user | client/query caching; server cache optional only with evidence |
| user mapping | per-user | retain existing short-lived mapping cache |

These values are operational defaults, not permanent business rules.

Measurements SHOULD determine later tuning.

---

# 21. Failure model

The architecture MUST remain correct under these failures.

## Worker unavailable

```text
latest committed quote remains readable
no new Telegram quote can arrive
```

This matches the current operational model.

## Server restarts

```text
SSE connections terminate
clients reconnect
server re-establishes LISTEN
server reads current state
stream continues
```

No event broker recovery is required because PostgreSQL contains authoritative state.

## PostgreSQL notification missed

```text
reconnect/reconciliation
→ authoritative DB snapshot
```

Correctness does not depend on receiving every notification.

## Client suspended

When resumed:

```text
reconnect
+
latest reconciliation
+
chart reconciliation when stale
```

## Duplicate event

Ignored using revision/idempotency.

## Older event

Ignored when:

```text
event.revision <= current.revision
```

---

# 22. Why direct Worker → Server push is not preferred

An alternative architecture could be:

```text
Worker
   │
HTTP/event
   ▼
Server
```

This creates unnecessary runtime coupling.

If Server is unavailable when the Worker persists a quote, Worker must then decide:

```text
retry?
queue?
drop?
persist delivery state?
```

That turns the Worker into a delivery subsystem.

Using PostgreSQL as the synchronization boundary instead gives:

```text
Worker
  │
  ▼
commit DB state
  │
  ▼
Worker responsibility complete
```

Server independently observes/reconciles that state.

This preserves the existing application boundary where Worker owns Telegram ingestion and PostgreSQL owns durable application state.

---

# 23. Why Redis/NATS/Kafka is not currently justified

The supported topology remains:

```text
one Server
one Worker
≤ small user population
one global quote stream
```

Introducing:

```text
Redis Pub/Sub
NATS
RabbitMQ
Kafka
```

would add:

```text
another runtime dependency
another failure domain
deployment complexity
monitoring requirements
recovery semantics
operational cost
```

without solving a currently demonstrated scaling problem.

PostgreSQL already exists and explicitly provides asynchronous `LISTEN/NOTIFY` for inter-process signalling.

Therefore introducing an external broker now would be overengineering.

This decision SHOULD be revisited only when topology or throughput materially changes.

---

# 24. Why WebSocket is not currently justified

WebSocket is appropriate when the connection itself must support meaningful bidirectional realtime interaction.

ZarBit currently has:

```text
market events:
Server → Web

commands:
Web → RPC → Server
```

Therefore WebSocket does not replace an existing missing capability.

SSE gives ZarBit the required server-push behavior while retaining normal RPC for commands.

If the future product introduces:

```text
high-frequency two-way trading
large topic subscriptions
interactive realtime negotiation
large numbers of private realtime channels
```

the transport decision can be revisited.

---

# 25. Why pure polling is not the target

Polling remains simple and robust, but it has a structural inefficiency for market data.

Example:

```text
20 clients
×
1 request every 3 seconds
×
most intervals contain no new quote
```

still causes repeated:

```text
HTTP/RPC processing
authentication
rate-limit consumption
cache checks
response serialization
network transfer
client state handling
```

When a quote changes only occasionally, polling asks:

```text
"did anything change?"
"did anything change?"
"did anything change?"
```

An event-driven market stream instead sends information primarily when state actually changes.

This becomes increasingly beneficial as:

```text
client count increases
polling interval decreases
payload size increases
```

---

# 26. Why snapshot + stream is preferable

A stream alone is insufficient because clients can disconnect.

A snapshot alone is inefficient for realtime updates.

Combining them gives complementary guarantees:

```text
snapshot
    =
authoritative current state

stream
    =
low-latency incremental updates

reconciliation
    =
recovery from missed/disconnected state
```

This architecture follows the same high-level pattern used by realtime market systems while avoiding their unnecessary scale-specific infrastructure.

---

# 27. Security boundaries

The Market/User separation MUST NOT weaken ZarBit authentication.

Public exposure of market data is a separate product decision.

If ZarBit remains a private Mini App, market procedures and streams MAY still require validated Mini App access.

User Data MUST always retain verified ownership.

The existing rule remains:

```text
never trust client-selected Telegram user ID
```

Telegram Mini App `initData` must be cryptographically verified and ownership derived from verified identity.

Credentials, initData, Telegram secrets and private request payloads MUST NOT enter realtime event metadata or logs.

---

# 28. Observability

The Market Data Plane SHOULD expose enough metrics to distinguish:

```text
source delay
database delay
server propagation delay
client delivery/reconnection issues
```

Useful server metrics include:

```text
active SSE connections

quote events received from PostgreSQL

quote events published to clients

latest snapshot reads

chart reads

listener reconnect count

listener downtime

SSE connection duration

SSE reconnect count where observable

revision gaps detected

duplicate/old revisions ignored
```

Latency SHOULD distinguish at least:

```text
announcedAt
persistedAt
publishedAt
```

when those timestamps can be measured reliably.

This prevents a fresh network delivery from being mistaken for a fresh market quote.

---

# 29. Proposed implementation phases

## Phase 1 — Domain separation

Establish explicit Market/User boundaries in architecture and contracts.

Target shape:

```text
quote.latest
quote.chart

requests.*
telegram.*
auth.*
```

No aggregate dashboard contract should own unrelated domains.

---

## Phase 2 — Lightweight snapshots

Make `quote.latest` genuinely lightweight.

`quote.latest` MUST NOT internally load the entire chart.

Introduce an independent `quote.chart`.

---

## Phase 3 — Database notification

After successful quote persistence:

```text
NOTIFY quote_changed
```

Establish one long-lived Server listener.

PostgreSQL remains authoritative.

---

## Phase 4 — `quote.live`

Introduce an oRPC Event Iterator/SSE procedure.

Events contain only the realtime quote head and authoritative revision metadata.

---

## Phase 5 — Web integration

Dashboard:

```text
bootstrap latest
bootstrap chart
connect live stream
derive display chart
```

Remove periodic `quote.latest` polling while stream health is normal.

---

## Phase 6 — Recovery and reconciliation

Implement:

```text
reconnect
revision comparison
latest snapshot recovery
chart refresh when stale
```

---

## Phase 7 — Measurement

Measure production behavior before further infrastructure changes.

Important metrics:

```text
quote frequency

market payload size

SSE connection stability

client reconnect frequency

PostgreSQL listener stability

Server CPU/memory

DB reads

network traffic

p95/p99 propagation latency
```

Only measurements justify the next architectural step.

---

# 30. Rejected architecture: combined Dashboard endpoint

The system SHOULD NOT use one permanent endpoint such as:

```text
dashboard.getEverything
```

containing:

```text
latest quote
chart
active requests
history
Telegram state
```

Different parts have different:

```text
ownership
freshness
cacheability
payload size
failure domains
invalidation rules
```

Combining them trades short-term convenience for long-term coupling.

oRPC batching already allows independent procedures to share a physical HTTP exchange without merging their domain contracts. Current ZarBit transport supports batching multiple read procedures.

Therefore:

```text
transport aggregation
```

is acceptable.

```text
domain aggregation
```

is generally not.

---

# 31. Existing contract drift

Current project documentation contains an existing disagreement that MUST be resolved separately from this architecture.

`PRODUCT.md` states that quote history is not maintained in the current phase.

`BUSINESS-RULES.md` similarly lists quote history outside current product scope.

However, the architecture investigation found an implemented `QuoteHistory` and three-day chart flow.

Before implementing `quote.chart` as a permanent public contract, the product documentation MUST decide whether quote history is officially part of the product.

Architecture MUST NOT silently redefine business scope.

---

# 32. Scaling thresholds

The proposed design is intentionally optimized for the current ZarBit topology.

Re-evaluate PostgreSQL `LISTEN/NOTIFY` when one or more of these assumptions stop being true:

```text
multiple Server replicas require richer fan-out/replay semantics

large event throughput develops

many independent market topics appear

events themselves must be durably replayed

consumer groups become necessary

cross-region delivery is required

PostgreSQL notification traffic becomes operationally significant
```

Possible future replacements include:

```text
Redis Streams
NATS JetStream
Kafka
dedicated market-data service
```

but no migration SHOULD happen before a concrete requirement exists.

---

# 33. Architectural invariants

Future implementations and LLM agents MUST preserve these rules:

1. Market Data and User Data are separate domains.
2. `quote.latest` is a lightweight authoritative snapshot.
3. `quote.chart` owns historical snapshot data.
4. `quote.live` carries incremental market updates.
5. PostgreSQL is the authoritative quote state.
6. PostgreSQL notification is a signal, not the source of truth.
7. Market ordering uses a server-authoritative monotonic revision.
8. `announcedAt` remains the original Telegram message timestamp.
9. SSE failure must be recoverable using snapshots.
10. Chart freshness MUST NOT dictate latest-quote freshness.
11. User-specific state MUST NOT be bundled into the global market stream.
12. Active and historical requests MUST remain server-filtered independent collections.
13. Raw recent-request truncation MUST NOT replace active-request correctness.
14. RPC batching MAY optimize transport without merging domain contracts.
15. Redis, Kafka, NATS or additional distributed infrastructure MUST NOT be introduced without measured justification.
16. WebSocket MUST NOT replace SSE unless bidirectional realtime requirements justify it.
17. Direct Worker→Server event delivery MUST NOT make successful quote persistence dependent on Server availability.
18. Client cache mutation MUST NOT become the source of historical quote truth.
19. Disconnect/reconnect is a normal operating condition, not an exceptional architecture case.
20. Changes to business scope must be reflected in `PRODUCT.md` and `BUSINESS-RULES.md` before architecture assumes them.

---

# 34. Target end-state

The desired future state is:

```text
                         GLOBAL MARKET DATA

Telegram
   │
   ▼
Worker
   │
   │ persist
   ▼
PostgreSQL
   │
   ├──────── quote state/history
   │
   └──────── LISTEN / NOTIFY
                    │
                    ▼
                  Server
                    │
           ┌────────┴────────┐
           │                 │
           ▼                 ▼
      latest/chart          live
          RPC               SSE
           │                 │
           └────────┬────────┘
                    ▼
                   Web
                    │
                    ▼
       local derived presentation


                         USER DATA

Web
 │
 ├── auth.identity
 ├── telegram.status
 ├── requests.active
 ├── requests.history
 ├── requests.detail
 └── mutations
          │
          ▼
         RPC
          │
          ▼
        Server
          │
          ▼
      PostgreSQL
```

---

# 35. Final decision

For ZarBit's expected scale, the recommended realtime architecture is:

```text
Market Data
=
RPC Snapshot
+
PostgreSQL LISTEN/NOTIFY
+
oRPC Event Iterator / SSE
+
revision-based reconciliation


User Data
=
independent authenticated RPC queries/mutations
+
domain-specific polling/invalidation where required
```

This architecture is preferred because it simultaneously provides:

```text
lower unnecessary polling traffic
lower repeated market payload transfer
low-latency quote updates
clear global/private data boundaries
simple recovery
strong database authority
minimal new infrastructure
compatibility with the existing oRPC/Hono/PostgreSQL stack
a clear path to future scaling
```

It adopts the **snapshot + incremental stream + reconciliation** pattern demonstrated by realtime trading systems while deliberately avoiding exchange-scale infrastructure that ZarBit does not currently need. Coinbase and Binance both distinguish realtime market streams from authenticated user streams, supporting the underlying separation of concerns used by this design. 

The goal is therefore not maximum realtime complexity.

The goal is:

```text
the smallest architecture
that provides correct realtime behavior
without coupling unrelated data domains.
```