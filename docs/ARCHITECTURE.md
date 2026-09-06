# Zarbit — Architecture

## Boundaries

| Component          | Responsibility                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------- |
| apps/web           | React/Vite, HeroUI, TanStack Router/Query, Persian RTL UI                                   |
| apps/server        | Hono API, Mini App identity/allowlist, request CRUD, bot launcher, worker proxy             |
| apps/worker        | All MTProto clients, OTP, membership, session files, quote execution, Bot API notifications |
| packages/contracts | Shared strict Zod commands and public TypeScript DTOs                                       |
| packages/domain    | Integer price conversion, quote parser and Telegram message builders                        |
| packages/db        | Prisma/PostgreSQL, atomic request/session operations                                        |
| packages/env       | Service-specific environment contracts and independent database configuration               |

There is no MTProto client or session volume on the server. Server, worker, and migration job use one PostgreSQL user. The worker alone owns its protected per-user session volume; the stopped-service migration job mounts it only for ownership and locking maintenance.

## Database access

The migration job receives only `MIGRATION_DATABASE_URL` and runs `prisma migrate deploy` before runtime services start. Server and worker receive only `DATABASE_URL`; both values use the same PostgreSQL user. Each runtime process owns one Prisma client backed by one direct `pg` pool, capped at five connections with five-second checkout and 30-second idle timeouts. PostgreSQL handles concurrency; no PgBouncer or shared application pool is used.

Worker logs include safe pool totals/idle/waiting counts with database failures. The server root health endpoint and worker private health endpoint both execute `SELECT 1`, so a healthy process without a usable database is not reported ready.

## Internal protocol

Authenticated browser → Hono server → bearer-authenticated worker HTTP on private port 3002. `WORKER_INTERNAL_URL` belongs only to the server. `WORKER_INTERNAL_TOKEN` is shared. The worker rechecks the database owner and allowlist. Neither public nor internal commands accept browser-selected ownership.

Worker has no public port/domain or Dokploy proxy route. Its private Compose network retains outbound Internet access for Telegram and managed PostgreSQL. One server and one worker remain the supported topology; PostgreSQL does not authorize concurrent Telegram workers.

## Session ownership

One runtime client and one serialized operation stream per user. Runtime reservations include pending login/recovery and are capped at 20. Synchronization cannot overlap, and work for different users runs independently. I/O has a 20-second deadline; failed reconnects back off from 10 seconds to a five-minute ceiling.

A local SQLite OS lock on `.worker-owner.sqlite` prevents another current-version worker opening the same session volume. It is released on shutdown/crash; this assumes a local volume with reliable file locking, not a network filesystem. State revision and conditional activation prevent a late operation reactivating a revoked/replaced session. File names are random 64-hex values, directory mode 0700, files 0600, runtime UID 1000. Clients close before files are removed. Network failures keep authorization; revoked authorization is removed.

## Requests and PostgreSQL

Only short database transactions; no Telegram calls inside them. Atomic claims check owner, ACTIVE/unclaimed state, current price condition, quote date, and ready session revision. Concurrent edits/cancellations cannot modify a claimed request. The request list uses `(userId, status, createdAt DESC, id DESC)`; active candidates use separate `LTE` and `GTE` partial indexes.

PostgreSQL and Telegram cannot jointly guarantee exactly-once delivery. After a crash, unfinished claims become FAILED with an explicit unknown-result warning and are never retried automatically. A successful trade followed by bot failure remains successful.

## Web state

Private queries are gated by Mini App authentication and scoped by Telegram user ID. Session polling is one second during enrollment/disconnect, otherwise ten seconds while visible; request polling is ten seconds while visible. Focus refreshes state. Mutations do not retry automatically. OTP mutation data is cleared after each response, never persisted.

API/login responses use no-store. `VITE_SERVER_URL` is a required build-time URL; production rejects HTTP and loopback. Nginx serves hashed assets immutably, but revalidates index.html and sw.js. PWA updates require explicit user action.

## Deployment

Dokploy Compose has no labels or host ports. `dokploy-network` is external and connects web, migration, server, and worker to Dokploy services; the private `backend` network exists only for server-worker RPC. Domains target web:80 and server:3000 only. An explicit migration job prepares the session volume and applies PostgreSQL migrations before services start. Managed PostgreSQL provides TLS, backups/PITR, monitoring, and a Dokploy network allowlist; its lifecycle is outside Compose.

See [POSTGRES.md](POSTGRES.md) and [OPERATIONS.md](OPERATIONS.md) for provisioning, cutover, and rollback.
