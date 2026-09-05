# Zarbit — Architecture

## Boundaries

| Component          | Responsibility                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------- |
| apps/web           | React/Vite, HeroUI, TanStack Router/Query, Persian RTL UI                                   |
| apps/server        | Hono API, Mini App identity/allowlist, request CRUD, bot launcher, worker proxy             |
| apps/worker        | All MTProto clients, OTP, membership, session files, quote execution, Bot API notifications |
| packages/contracts | Shared strict Zod commands and public TypeScript DTOs                                       |
| packages/domain    | Integer price conversion, quote parser and Telegram message builders                        |
| packages/db        | Prisma/libSQL SQLite, atomic request/session operations                                     |
| packages/env       | Service-specific environment contracts and independent database configuration               |

There is no MTProto client or session volume on the server. Server and worker share only the application database volume. The worker owns its protected per-user session volume; the stopped-service migration job mounts it only for ownership/locking maintenance.

## Internal protocol

Authenticated browser → Hono server → bearer-authenticated worker HTTP on private port 3002. WORKER_INTERNAL_URL belongs only to the server. WORKER_INTERNAL_TOKEN is shared. The worker rechecks the database owner and allowlist. Neither public nor internal commands accept browser-selected ownership.

Worker has no public port/domain or Dokploy proxy route. Its private Compose network retains outbound Internet access for Telegram. One server, one worker and one SQLite volume remain the supported topology.

## Session ownership

One runtime client and one serialized operation stream per user. Runtime reservations include pending login/recovery and are capped at 20. Synchronization cannot overlap, and work for different users runs independently. I/O has a 20-second deadline; failed reconnects back off from 10 seconds to a five-minute ceiling.

A SQLite OS lock on .worker-owner.sqlite prevents another current-version worker opening the volume. It is released on shutdown/crash; this assumes local volumes with reliable SQLite locking, not network filesystems. Stop the older pre-lock worker manually during first upgrade.

State revision and conditional activation prevent a late operation reactivating a revoked/replaced session. File names are random 64-hex values, directory mode 0700, files 0600, runtime UID 1000. Clients close before files are removed. Network failures keep authorization; revoked authorization is removed.

## Requests and SQLite

Only short database transactions; no Telegram calls inside them. Atomic claim checks owner, ACTIVE/unclaimed state, current price condition, quote date and ready session revision. Concurrent edits/cancellations cannot modify a claimed request.

SQLite and Telegram cannot jointly guarantee exactly-once delivery. After a crash, unfinished claims become FAILED with an explicit unknown-outcome message and are never retried automatically. A successful trade followed by bot failure remains successful.

## Web state

Private queries are gated by Mini App authentication and scoped by Telegram user ID. Session polling is one second during enrollment/disconnect, otherwise ten seconds while visible; request polling is ten seconds while visible. Focus refreshes state. Mutations do not retry automatically. OTP mutation data is cleared after each response, never persisted.

API/login responses use no-store. VITE_SERVER_URL is a required build-time URL; production rejects HTTP and loopback. Nginx serves hashed assets immutably, but revalidates index.html and sw.js. PWA updates require explicit user action.

## Deployment

Dokploy Compose has no labels, host ports or required external network. Domains target web:80 and server:3000 only. An explicit migrate job prepares volume ownership and applies new migrations before services start. No distributed worker, PostgreSQL, Redis or queue is introduced.

See OPERATIONS.md for first upgrade, backup and rollback. Basic CI performs typecheck/build; final runtime image stages verify native storage without Telegram login.
