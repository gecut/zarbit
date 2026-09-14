# Zarbit — Architecture

## Boundaries

| Component          | Responsibility                                                                          |
| ------------------ | --------------------------------------------------------------------------------------- |
| apps/web           | React/Vite, HeroUI, TanStack Router/Query, Persian RTL UI, quote & trade dashboard      |
| apps/server        | Hono API, Mini App identity/allowlist, shared Market snapshot/history/SSE, worker proxy |
| apps/worker        | All MTProto clients, OTP, membership, session files, reply extraction, data ingestion   |
| packages/contracts | Shared strict Zod commands and public TypeScript DTOs                                   |
| packages/domain    | Integer quote conversion, group trading grammar, receipt/action parsers                 |
| packages/db        | Prisma/PostgreSQL: sessions, requests, QuoteHistory, Trade, TradingAction, Participant  |
| packages/logger    | Shared Pino JSON logging, redaction and opaque correlation references                   |
| packages/env       | Service-specific environment contracts and independent database configuration           |

There is no MTProto client or session volume on the server. Server, worker, and migration job use one PostgreSQL user. The worker alone owns its protected per-user session volume; the stopped-service migration job mounts it only for ownership and locking maintenance.

## Database access

The migration job receives only `MIGRATION_DATABASE_URL` and runs `prisma migrate deploy` before runtime services start. Server and worker receive only `DATABASE_URL`; both values use the same PostgreSQL user. Each runtime process owns one Prisma client backed by one direct `pg` pool, capped at five connections with five-second checkout and 30-second idle timeouts. The Server additionally owns one dedicated `pg.Client` for LISTEN, outside the Prisma pool (Server 5 + listener 1; Worker 5). PostgreSQL handles concurrency; no PgBouncer or shared application pool is used.

Worker logs include safe pool totals/idle/waiting counts with database failures. The server root health endpoint and worker private health endpoint both execute `SELECT 1`, so a healthy process without a usable database is not reported ready.

## Internal protocol

Authenticated browser → Hono server → bearer-authenticated worker HTTP on private port 3002. `WORKER_INTERNAL_URL` belongs only to the server. `WORKER_INTERNAL_TOKEN` is shared. The worker rechecks the database owner and allowlist. Neither public nor internal commands accept browser-selected ownership.

Worker has no public port/domain or Dokploy proxy route. Its private Compose network retains outbound Internet access for Telegram and managed PostgreSQL. One server and one worker remain the supported topology; PostgreSQL does not authorize concurrent Telegram workers.

Telegram login uses a versioned asynchronous command contract. PostgreSQL owns operation admission, idempotency, cancellation intent and safe outcome metadata; the worker owns MTProto credentials and challenge state in memory. The web client derives actions from separate authorization, worker, connection and membership facts, so a worker timeout never masquerades as logout.

## Session ownership

One runtime client and one serialized operation stream per user. Runtime reservations include pending login/recovery and are capped at 20. Synchronization cannot overlap, and work for different users runs independently. I/O has a 20-second deadline; failed reconnects back off from 10 seconds to a five-minute ceiling.

A local SQLite OS lock on `.worker-owner.sqlite` prevents another current-version worker opening the same session volume. It is released on shutdown/crash; this assumes a local volume with reliable file locking, not a network filesystem. State revision and conditional activation prevent a late operation reactivating a revoked/replaced session. File names are random 64-hex values, directory mode 0700, files 0600, runtime UID 1000. Clients close before files are removed. Network failures keep authorization; revoked authorization is removed.

## Market data and PostgreSQL

Market data is ingested continuously by connected worker sessions. QuoteHistory enforces `UNIQUE(sourceMessageId)`; Trade and TradingAction enforce `(chatId, sourceMessageId)` uniqueness to ensure idempotent writes despite multiple worker sessions observing the same group messages simultaneously.

Canonical bot quote messages (`🟡 مظنه: <price> 🟡`) serve as the authoritative quote source in `QuoteHistory`. Authoritative bot receipts (`حواله`) create `Trade` records, which are permanently retained. Market heads use indexed source-ID order. There is no duplicate LatestTrade table. Database writes remain short and contain no Telegram calls. See [MARKET-DATA.md](MARKET-DATA.md) for full ingestion, entity, and identity resolution rules.

## Web state

Market is a shared authenticated plane (`market.snapshot/live`); identity, Requests and Telegram remain independent private procedures. Worker insert transactions call `pg_notify` only for new Quote/Trade rows. One dedicated listener confirms LISTEN before hydration and buffers signals during startup. It reads authoritative committed rows, advances each head independently and fans out through a bounded hub. Failures disconnect streams, back off, re-LISTEN and rehydrate; notifications are never assumed replayable. SIGTERM/SIGINT close the hub/listener before HTTP and Prisma shutdown.

`MarketState` contains heads/revision/readiness only. TanStack owns the market snapshot query. Healthy snapshot polling is disabled; degraded streams use fallback reads. QuoteHistory and Trade remain separate canonical datasets. User polling and mutation invalidation never depend on Worker availability for Market. See [RPC.md](RPC.md) for exact cache owners, revision ordering, timeout and recovery policies.

Hono exposes authenticated `/rpc/*` and `/openapi/*` adapters over one contract-first router. The old browser rollback transport and public quote namespace have been removed; unmapped legacy files must not be extended. One server and one worker remain supported. No outbox, event table, Redis, broker, WebSocket or Follow implementation is introduced.

API/login responses use no-store. `VITE_SERVER_URL` is a required build-time URL; production rejects HTTP and loopback. Nginx serves hashed assets immutably, but revalidates index.html and sw.js. PWA updates require explicit user action.

## Deployment

Dokploy Compose has no labels or host ports. `dokploy-network` is external and connects web, migration, server, and worker to Dokploy services; the private `backend` network exists only for server-worker RPC. Domains target web:80 and server:3000 only. An explicit migration job prepares the session volume and applies PostgreSQL migrations before services start. Managed PostgreSQL provides TLS, backups/PITR, monitoring, and a Dokploy network allowlist; its lifecycle is outside Compose.

See [POSTGRES.md](POSTGRES.md) and [OPERATIONS.md](OPERATIONS.md) for provisioning, cutover, and rollback.
