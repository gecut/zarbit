# Web/server RPC

The default browser transport is oRPC **1.15.0**, pinned across packages. `@zarbit/contracts/rpc` owns input, output and error schemas; browser types are derived from this contract without importing server implementations. Hono hosts `/rpc/*`. The existing worker protocol and database schema are unchanged.

## Procedures and transport

- `auth.identity`
- `quote.latest`, `quote.dashboard`
- `telegram.status`, `telegram.command` (login/code/password/resend/cancel/membership/revoke)
- `requests.active`, `requests.history`, `requests.detail`, `requests.create`, `requests.update`, `requests.cancel`, `requests.forceSend`

Every procedure verifies Telegram initData and the allowlist. Owners come only from that verified identity. User lookup/upsert is cached for five minutes; signature/expiry checks are **not** cached. No secret or initData appears in query keys or logs. Per-provider and per-user key scopes prevent cache sharing between identities. A 401 discards private snapshots and closes the authentication gate.

Read calls may batch in groups of at most four; commands and mutations are independent. Server bodies are limited to 16 KiB. Responses are `no-store`; large RPC responses support compression. Query cancellation and a 30-second client deadline are combined. Writes never retry or queue for later reconnect, because an uncertain send must not be repeated automatically.

The protected `GET /api/openapi.json` generates OpenAPI from the same contract. Its documented `/openapi/*` HTTP routes use the same router, authorization, cache and capacity controls. OpenAPI is a separate HTTP representation, not a description of the oRPC wire format.

## Freshness

| Data            | Client stale time | Mounted polling                                                          | Server cache                                   |
| --------------- | ----------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Quote/dashboard | 2 s               | 3 s foreground/background                                                | 1 s fresh + at most 1 s SWR, global            |
| Active requests | 2 s               | 3 s foreground/background, including an empty list                       | 1 s, private, no stale fallback                |
| Request detail  | 2 s               | 3 s while ACTIVE; stops at terminal status                               | None                                           |
| Telegram status | 2 s               | 2 s login/revoking/connecting; 5 s otherwise; stops disconnected/revoked | 1 s, private, no stale fallback                |
| Identity        | 5 min             | 5 min while mounted                                                      | User mapping 5 min; authentication always live |
| Request history | 5 min             | 5 min while mounted                                                      | None; paginated PostgreSQL read                |

All stale mounted queries refresh on focus/reconnect. Fast polling runs in a hidden tab where the browser permits timers. A suspended/closed Mini App, service worker, or mobile OS cannot guarantee background execution. TanStack pauses offline reads; paused retries resume once its connectivity/focus conditions are satisfied. No custom always-on service worker or duplicate visibility listeners are installed.

History uses oRPC infinite query options, opaque cursors and up to ten retained pages. Pointer intent prefetches the next cursor through oRPC query options; the infinite query consumes that page cache. Mutations invalidate the generated request-key prefix, cancel earlier reads, and update known detail snapshots. Removed active records invalidate history. Terminal detail views stop periodic polling, retaining focus refresh. Session commands invalidate session/request/quote keys and clear credential mutation state.

Transient reads retry at most twice with exponential backoff/jitter and respect the typed retry deadline. Validation/auth/conflict errors do not retry. Server errors keep Persian messages, application error codes and retry metadata. Last quote timestamps remain the publisher's original timestamps; refreshing the cache does not make an old announcement fresh.

## Capacity and observability

Each application instance owns bounded caches (100 private entries; one quote snapshot), single-flight refreshes, a database-read gate of three operations, and a worker-status gate of four. No unbounded work queue is introduced. A read caller times out after three seconds, but its concurrency permit remains occupied until the underlying work actually settles. This protects the pool even when PostgreSQL is slow; it is **not** database query cancellation. The existing pool checkout timeout still applies. Worker status HTTP calls abort after 2.5 seconds; mutating commands keep their existing 25-second deadline.

Read rate budget per verified user: burst 30, refill 10/s. Mutation budget: burst 6, refill 1/s. Budget exhaustion returns 429, a typed `retryAt`/`retryAfter` and `Retry-After` header. The existing OTP delivery limits still apply. Read and write budgets are separate. Cache misses merge; failed refreshes do not replace valid snapshots, and hard-expired snapshots are never served. Mutation invalidation prevents older in-flight results from refilling the server cache. Mutations always perform live session checks and preserve revocation persistence before the worker call.

`rpc.metrics` is emitted on traffic at most once per minute: bounded-window p50/p95/p99 durations and failure counts for procedure/data-access groups plus cache hit/miss/stale/coalesced/failure counters. `rpc.failed` debug events include a generated request ID, procedure and safe error code. Input bodies, credential values, raw identity headers and database connection strings are not logged. The in-process load test checks twenty concurrent requests and store-call counts; its latency is **not** a production SLO.

One server and one worker remain the supported topology. These caches are local to a server instance. No Redis, distributed locking, additional worker, migration or pool-size increase is introduced. Measure actual network/DB p95, pool waits and error rate in staging before increasing traffic. Database-side statement deadlines can be evaluated separately with production query evidence.

## Rollout and rollback

1. Deploy the server before the new web bundle; it supports both oRPC and the existing `/api/*` routes.
2. Build web with the normal public HTTPS `VITE_SERVER_URL`; `VITE_RPC_TRANSPORT=rpc` is the default.
3. Verify identity, quote, enrollment, request creation/cancellation, uncertain-send states, history pagination, focus/reconnect and metrics in staging. Real Telegram writes need the owner's controlled-account check.
4. To revert browser transport, rebuild this revision with `VITE_RPC_TRANSPORT=legacy`. This is a build-time flag; changing container runtime variables cannot change a shipped bundle.

Legacy HTTP parsing is isolated in the rollback adapter. It has the same query policies but does not promise the oRPC cache/batching capacity profile. Do not flip back automatically after errors or timeouts: a mutation may already have taken effect. Remove the compatibility routes/adapter only after old PWA clients and the rollback window are retired. Development mocks continue using the existing scenarios behind the typed RPC surface.

## Sources and validation

- [oRPC contract-first implementation](https://v1.orpc.dev/docs/contract-first/implement-contract)
- [oRPC TanStack Query integration](https://v1.orpc.dev/docs/integrations/tanstack-query)
- [oRPC Hono adapter](https://v1.orpc.dev/docs/adapters/hono)
- [oRPC batching](https://v1.orpc.dev/docs/plugins/batch-requests)
- [TanStack polling](https://tanstack.com/query/latest/docs/framework/react/guides/polling)

Run server/web tests, contracts/server typechecks, direct web TypeScript, focused ESLint and production builds. Server tests using fixture stores can use a dummy PostgreSQL URL solely to satisfy module configuration; those tests do not establish PostgreSQL connectivity or database load capacity.
