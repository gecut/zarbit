# Zarbit — Architecture

## Boundaries

| Component          | Responsibility                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web           | React 19, Vite, HeroUI v3, TanStack Router/Query, Persian RTL UI, Terminal quote & recent trades, Requests radar, 7D Whale Leaderboard, Telegram session management                                                                                                             |
| apps/server        | Hono API, Mini App initData HMAC & allowlist, shared Market snapshot cached reads, Requests CRUD & forceSend, 7D Participant Analytics & Trader Detail, Worker async operation dispatch & status proxy                                                                          |
| apps/worker        | Up to 20 MTProto user sessions, OTP login state machine, group membership, `/sessions` volume ownership, Telegram group ingestion (quotes, receipts, orders, actions), conservative identity resolver, request matching & execution engine, private HTTP server on port 3002    |
| packages/contracts | Shared strict Zod schemas, oRPC v1.15 contract router definitions, Telegram contract v3 DTOs, Market snapshot schemas, Analytics DTOs                                                                                                                                           |
| packages/domain    | Compact integer quote arithmetic, receipt/display Toman price conversions, Persian/Arabic text/digit normalization, protocol message parsers (canonical quotes, receipts, canonical orders, human orders), 7-day WACB participant position & P&L calculator, quote downsampling |
| packages/db        | Prisma 7.10.0 + `@prisma/adapter-pg` on PostgreSQL: TelegramUser, TelegramSession, TelegramOperation, LoginRateLimit, Request, QuoteHistory, Participant, TradingAction, Trade                                                                                                  |
| packages/logger    | Shared Pino JSON logging, redaction, and opaque correlation references                                                                                                                                                                                                          |
| packages/env       | `@t3-oss/env-core` runtime environment validation contracts for server, worker, web, and db                                                                                                                                                                                     |

There is no MTProto client or session volume on the server. Server, worker, and migration job share the same PostgreSQL database user. The worker alone owns its protected per-user session volume; the stopped-service migration job mounts it only for volume permission and locking maintenance.

## Database access

The migration job receives `MIGRATION_DATABASE_URL` and executes `prisma migrate deploy` before runtime services start. Server and worker receive `DATABASE_URL`; both use the same PostgreSQL user.

Each runtime process owns one Prisma client backed by one direct `pg.Pool`, capped at `DATABASE_POOL_MAX` (default 5 connections) with a five-second connection checkout timeout and 30-second idle timeout. PostgreSQL handles concurrency directly; no PgBouncer or shared connection broker is used.

Worker and server logs report connection health and failures. The server root health endpoint (`GET /`) and the worker private health endpoint (`GET /health`) both execute `SELECT 1` against PostgreSQL, ensuring that a process without a usable database connection is never reported healthy.

## Internal protocol and operations

Communication flows from authenticated browser → Hono server → bearer-authenticated worker HTTP on private port 3002.

- `WORKER_INTERNAL_URL` is configured only on the server (default `http://127.0.0.1:3002` locally, `http://worker:3002` in Compose).
- `WORKER_INTERNAL_TOKEN` is a shared secret of at least 32 characters verified with timing-safe comparison.
- The worker re-verifies ownership and allowlist constraints; neither public nor internal endpoints accept browser-selected ownership.
- The worker has no public port, domain, or Dokploy proxy route. Its private Compose network retains outbound Internet access for Telegram MTProto and managed PostgreSQL.
- One server and one worker remain the supported topology.

Telegram account management uses a versioned asynchronous operation contract (v3):

1. Client submits a command via `POST /rpc/telegram.command` with a client-generated operation UUID (`telegramCommandInputSchema`).
2. Server admits the operation into PostgreSQL `TelegramOperation` table and dispatches it to the worker via `POST /internal/operation`.
3. Cancellation (`cancel`) and revocation (`revoke`) are transactionally committed to PostgreSQL by the server before asynchronous worker dispatch, guaranteeing that session revocation and request cancellation succeed even if the worker is restarting or unreachable.
4. Client polls durable operation status via `GET /rpc/telegram/operation/{id}`.
5. Synchronous worker status probes and immediate execution commands (`type: "status"` and `type: "force-send"`) use `POST /internal/command`. All other command types sent to `/internal/command` return HTTP 409 `CLIENT_UPDATE_REQUIRED`.

## Session ownership

- One MTProto client and one serialized operation stream per user account.
- Runtime session capacity is capped at `MAX_TELEGRAM_SESSIONS` (default 20), including pending login challenges and active connections.
- MTProto I/O enforces a 20-second timeout. Failed reconnects back off from 10 seconds to a five-minute ceiling.
- A local SQLite OS lock on `/sessions/.worker-owner.sqlite` prevents multiple worker instances from concurrently accessing the same session volume. It is acquired on worker boot and released on graceful shutdown.
- Session storage files use random 64-hex names (`<hex>.sqlite`), directory mode `0700`, file mode `0600`, running under UID 1000.
- State revisions and conditional activations prevent stale operations from re-activating a revoked or replaced session. Network failures preserve session authorization; explicit revocation deletes stored session files.

## Market data and ingestion

Market data is continuously ingested from `TELEGRAM_GROUP_ID` by connected worker sessions:

- Canonical bot quotes (`🟡 مظنه: <price> 🟡`) are parsed via `parseCanonicalBotQuote` and recorded into `QuoteHistory`.
- Authoritative bot trade receipts (`حواله`) are parsed via `parseTradeReceipt` and recorded permanently into `Trade`.
- Authoritative bot active orders (`🔵 ... / 🔴 ...`) update the in-memory `BoundedOrderCache` and feed the participant identity resolver.
- Human trading intents (`ORDER_BUY`, `ORDER_SELL`, `TAKE_ALL`, `TAKE_QUANTITY`, `CANCEL`) are parsed via `parseHumanOrder` and recorded into `TradingAction`.

Idempotency across multiple concurrent worker sessions is enforced at the database level:

- `QuoteHistory` enforces `UNIQUE(sourceMessageId)`.
- `Trade` and `TradingAction` enforce `UNIQUE(chatId, sourceMessageId)`.
- Inserts execute with `skipDuplicates: true`. The first session commits the row (`count === 1`); concurrent duplicate observations return `count === 0` and are safely ignored.
- Database writes contain no outbound Telegram calls.

## Market serving and web state

Market data is served to authenticated clients through the shared `market.snapshot` RPC endpoint:

- Server `MarketState` maintains the current market heads by reading from `store.marketHeads()`, which queries the latest quote and up to 10 recent completed trades ordered by `[announcedAt DESC, sourceMessageId DESC]`.
- In-memory caching coalesces concurrent reads (5-second cache when offline/degraded, 60-second cache when connected).
- Web client (`useMarket`) polls `market.snapshot` on a 3-second cadence via TanStack Query (`marketPolling`: `staleTime: 1000`, `refetchInterval: 3000`, `refetchOnWindowFocus: "always"`, `refetchOnReconnect: "always"`).
- Connection status on the dashboard is derived from query state: `isFetching` → "در حال اتصال" (`connecting`), `isError` → "دریافت دوره‌ای" (`degraded`), and successful read → "زنده" (`healthy`).
- Monotonic head merge (`mergeMarketSnapshot`) prevents late HTTP responses from regressing visible market heads.

Hono exposes authenticated `/rpc/*` and `/openapi/*` adapters over one contract-first router. All RPC responses use `Cache-Control: no-store`. `VITE_SERVER_URL` is a required build-time URL; production rejects HTTP and loopback origins. Nginx serves hashed assets immutably and revalidates `index.html` and `sw.js`.

## Deployment

Dokploy deployment uses `compose.yml` (no host port mappings for internal services):

- `dokploy-network` (external) connects `web`, `migrate`, `server`, and `worker` to Dokploy services, public domains, and managed PostgreSQL.
- `backend` (internal) network exists solely for server-to-worker internal HTTP.
- Public domains route to `web:80` and `server:3000` only. Worker port 3002 is unexposed.
- The `migrate` container runs `node /app/deploy/migrate.mjs` before server and worker start, applying migrations and ensuring proper session volume ownership.
- Managed PostgreSQL provides TLS, automated backups/PITR, and connection monitoring outside Compose.

See [README.md](README.md) for documentation index, [GLOSSARY.md](GLOSSARY.md) for domain terms, [adr/](adr/) for architecture decisions, and [POSTGRES.md](POSTGRES.md) / [OPERATIONS.md](OPERATIONS.md) for database topology, cutover, and operational procedures.
