# Web/server RPC

The only Web transport is oRPC **1.15.0**, with contract-first Hono `/rpc/*` and `/openapi/*` adapters. `packages/contracts/src/rpc.ts` owns procedures; `market.ts` owns the strict Market schemas. PostgreSQL is authoritative. The old public `quote.latest`, `quote.dashboard`, `quote.history` and browser legacy transport have been removed in a coordinated release.

## Data planes

| Plane         | Procedures                                                                                                  | Ownership                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Shared Market | `market.snapshot`, `market.live`                                                                            | Process-global state; authenticated access |
| Private User  | `auth.identity`, `telegram.status/command`, `requests.active/history/detail/create/update/cancel/forceSend` | Verified Mini App owner                    |
| Analytics     | `analytics.traders`, `analytics.traderDetail`                                                               | Independent read domain                    |

No Home aggregate combines Market, Requests or Telegram. Compatible snapshot/active-request HTTP calls may share a batch (maximum four). Telegram and the long-lived stream are outside that batch, avoiding Worker delays on critical market results.

Each procedure verifies initData and the allowlist. Identity mapping is cached five minutes; signature/expiry verification is not cached. The shared Market Web key uses the provider's scope, while User keys also include the user. A 401 clears cached data and closes the authentication gate. Credentials and raw identities never appear in keys or metric labels.

Ordinary fetch calls combine cancellation with a 30-second deadline. `market.live` uses cancellation without that deadline. It is an oRPC `eventIterator(schema)` (the installed 1.15 API), with event IDs `QUOTE:<sourceMessageId>` / `TRADE:<sourceMessageId>`. Resume metadata requests reconciliation, not durable replay. Every subscription receives SYNC or RECONCILE_REQUIRED immediately. The transport emits comment heartbeats at 15 seconds; oRPC's compression plugin excludes event streams. Each stream has a 30-minute maximum lifetime to force a fresh authenticated connection.

## Cache ownership and freshness

| Data                   | Key/scope and owner                          | Lifetime / refresh                                                                                                                | Failure / invalidation                                                                                           |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Market heads           | One Server `MarketState`                     | NOTIFY updates; single-flight DB hydration on startup/recovery; authoritative recheck when read after 60 s healthy / 5 s degraded | Last state is retained; expired verification failure returns a local RPC error; stream refuses degraded listener |
| Web snapshot           | Shared provider Market key, TanStack Query   | 5 s stale; initial/focus/reconnect/reconciliation, no healthy interval                                                            | 10 s visible polling while degraded; per-stream monotonic head merge prevents late HTTP response regression      |
| Active Requests        | Server owner key; Web owner key              | Server 1 s; Web 4 s visible when nonempty, no empty interval                                                                      | Mutation/focus/reconnect/manual refresh; no stale Server fallback                                                |
| Request detail/history | Web owner + input                            | Existing detail lifecycle and cursor pagination                                                                                   | Mutation hooks exclusively own invalidation; no market invalidation                                              |
| Telegram status        | Server owner/session cache 1 s               | 2 s transitional; 15 s stable/disconnected, visible only                                                                          | Focus/reconnect; independent Worker failure                                                                      |
| Identity               | Server mapping + Web authentication boundary | Five minutes                                                                                                                      | Signature verification on every RPC; 401 discards caches                                                         |

Client visibility/offline transitions cancel the stream. Resume reconnects and reconciles. A four-second connection grace period precedes fallback polling; reconnect backoff is bounded at 30 seconds. Recovery reconciles snapshot before returning to the healthy policy. Query data is never copied into React component state. Realtime live events apply directly to the market snapshot in cache.

## Queries, revisions and limits

Snapshot reads two projected heads in parallel, ordered by source message ID. Its revision is the maximum head ID. Quote and Trade advance independently: a lower global ID may still advance the other stream. Message-ID gaps are normal and never imply missing market events. The supported single Telegram group and legacy null-chat Quote rows must be preserved; a multi-group migration needs a new revision scheme before rollout.

The shared read gate permits three operations and times out callers after three seconds while retaining permits until actual DB completion. Worker status has a separate four-operation gate. Server's normal pool remains five connections, plus one dedicated listener. Rate limits, 16 KiB request-body limit, mutation no-retry behavior and current error schemas remain unchanged.

`rpc.metrics` and `market.metrics` contain bounded duration samples and cache/listener/hub counters. Listener transition logs report hydration/downtime/reconnect durations without URLs or payloads. Hub counters track publication, active connections and slow-client disconnections. No raw revision or user ID is a metric label.

## Development and release

`/?marketScenario=normal` enables deterministic mocks only under Vite DEV. Fixtures use production schemas, per-instance state, a fixed injectable clock, bounded async iterators, controllable delays/failures and event scripts. See `apps/web/src/dev/market/market-scenarios.ts` for all scenarios. Production tree-shaking excludes this directory. `ApiProvider` stores the callable RPC proxy with `setClient(() => api)`; query utility proxies must not be spread into plain objects.

Deploy Server, Worker and Web from one immutable revision. Old PWA bundles are incompatible and require their existing update/reload flow; no aliases remain. Roll back the coordinated images/bundle together. PostgreSQL table schemas are unchanged. Ingestion rollback merely stops NOTIFY and new clients fall back to reads, but old server/web contracts still require matching versions.

Local builds, existing checks and direct PostgreSQL/SSE smoke are implementation evidence. Real Telegram receipt acceptance and actual Dokploy/Traefik proxy behavior are separate release gates in [OPERATIONS.md](OPERATIONS.md). No local timing is a production SLO.

## API reference

- [oRPC event iterator](https://v1.orpc.dev/docs/event-iterator)
- [oRPC contract-first implementation](https://v1.orpc.dev/docs/contract-first/implement-contract)
- [oRPC batching](https://v1.orpc.dev/docs/plugins/batch-requests)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
