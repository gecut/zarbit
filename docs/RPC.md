# Web/Server RPC

The only Web transport is oRPC **1.15.0**, mounted via contract-first Hono handlers on `/rpc/*` and `/api/openapi.json`. Contracts are defined in `packages/contracts/src/rpc.ts`; market schemas live in `market.ts`, telegram schemas in `telegram.ts`, and analytics schemas in `analytics.ts`. PostgreSQL is the single source of truth.

## Data planes

| Plane         | Procedures                                                                                                                                                                                                            | Ownership                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Shared Market | `market.snapshot`                                                                                                                                                                                                     | Process-global state; authenticated access |
| Private User  | `auth.identity`, `telegram.status`, `telegram.command`, `telegram.operation`, `requests.active`, `requests.history`, `requests.detail`, `requests.create`, `requests.update`, `requests.cancel`, `requests.forceSend` | Verified Mini App owner                    |
| Analytics     | `analytics.traders`, `analytics.traderDetail`                                                                                                                                                                         | 7-day rolling participant performance      |

Compatible snapshot and active-request HTTP calls may share a batch (maximum 4 requests via `BatchHandlerPlugin`).

Every procedure verifies `X-Telegram-Init-Data` with the bot token HMAC, 86,400-second expiration check, and allowlist membership (`ALLOWED_TELEGRAM_USER_IDS`). Telegram procedures additionally require the contract header `X-Zarbit-Telegram-Contract: 3`. Identity mapping is cached for 5 minutes; signature and expiration verification are evaluated on every request. A 401 response clears client caches and redirects to the authentication gate. All RPC responses include `Cache-Control: no-store`.

## Cache ownership and freshness

| Data                    | Key/scope and owner                            | Lifetime / refresh                                                                                                 | Failure / invalidation                                                                                  |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Market heads            | Server `MarketState`                           | Single-flight DB query (`store.marketHeads()`); 5 s cache when degraded/offline, 60 s cache when connected         | Retains last known valid heads; expired verification failure returns RPC error                          |
| Web market snapshot     | Shared provider Market key, TanStack Query     | `marketPolling`: 1 s staleTime, 3 s refetchInterval, no background polling, refetch on window focus/reconnect      | Monotonic head merge (`mergeMarketSnapshot`) prevents late HTTP responses from regressing visible state |
| Active Requests         | Server owner key (1 s); Web owner key          | Server 1 s; Web 4 s visible interval when active requests exist (`length > 0`), disabled when list is empty        | Invalidation on create, update, cancel, forceSend, and Telegram session changes; manual refresh         |
| Request detail/history  | Web owner + input                              | Cursor-based infinite pagination for history; detail on demand                                                     | Mutation hooks invalidate active and history query caches; no automatic polling                         |
| Telegram status         | Server owner cache (1 s); Web owner key        | Web 2 s during transitional states (`LOGIN_PENDING`, `REVOKING`, or active operation); 15 s when idle or connected | Refetch on window focus and reconnect; invalidation on command admission                                |
| Telegram operation      | Server PostgreSQL query; Web owner + UUID      | Web 2 s polling while operation is pending (`ACCEPTED`, `RUNNING`, `CANCEL_REQUESTED`); disabled when terminal     | Terminal state invalidates `telegram.status` and `requests.active` caches                               |
| Analytics traders       | Server cache `${sortBy}:${sortOrder}:${limit}` | Server 5 s TTL / 5 s staleTime; Web slow query (5 min staleTime, 5 min refetchInterval)                            | Automatic background refresh; isolated from market and user polling                                     |
| Analytics trader detail | Server direct read; Web owner + alias          | Direct DB read wrapped in read capacity limiter                                                                    | Cached by TanStack Query on the client; refetched on drawer open                                        |
| Identity                | Server user cache (5 min); Web auth boundary   | 5 minutes                                                                                                          | Fresh HMAC validation on every RPC; 401 clears all cached user data                                     |

## Queries, revisions and limits

- **Snapshot**: Reads the latest canonical quote from `QuoteHistory` and up to 10 recent completed trades from `Trade` in parallel. Its revision is `Math.max(quote.sourceMessageId, trade.sourceMessageId)`. Quote and Trade advance independently. Message ID gaps are expected and normal.
- **Read Capacity**: The shared read gate permits 3 concurrent operations per named query and times out callers after 3 seconds while retaining permits until DB completion. Worker status queries use a separate 4-operation read gate with a 3-second timeout.
- **Rate Limiting**: `RpcRateLimit` enforces per-user rate budgets, separating mutation budgets from read requests.
- **Payload Limits**: `BodyLimitPlugin` restricts request bodies to 16 KiB.
- **Metrics**: Server logs `rpc.metrics` and `market.metrics` periodically, tracking request durations, cache hit/miss/hydrate events, and database query durations. No raw user identities or credentials appear in metric labels.

## Development and mock modes

Under Vite DEV, `/?marketScenario=normal` activates deterministic in-browser mocks:

- `createMarketMock`: Implements production schemas, configurable delays, and fixture data without a backend.
- `createTelegramMock`: Simulates phone input, code requests, 2FA challenges, and membership checks.
- Scenarios live in `apps/web/src/dev/market/market-scenarios.ts`. Production builds tree-shake this entire directory.
- `ApiProvider` stores the callable RPC proxy via `setClient(() => api)`.

## API reference

- [oRPC contract-first implementation](https://v1.orpc.dev/docs/contract-first/implement-contract)
- [oRPC batching](https://v1.orpc.dev/docs/plugins/batch-requests)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)

## Settlement Analytics V2

`analytics.tradersV2` and `analytics.traderDetailV2` expose strict V2 schemas on `/analytics/v2/traders` and `/analytics/v2/traders/{alias}`. NORMAL recent trades have a receipt source ID and counterparty; SETTLEMENT trades have a settlement message ID, null receipt source and null counterparty. Normal, settlement and total contributions share the same WACB replay; total rounding is preserved, with the residual assigned to the settlement bucket. Historical same-alias records retain both participant sides in list and detail.

P&L is null without a valid bootstrap or when the seven-day window crosses that unproven baseline. Unverified later coverage is explicitly provisional; baseline validity, coverage status and P&L reliability are independent metadata. Cache keys include the durable analytics revision. After the first applied Settlement, V1 rejects with `CLIENT_UPDATE_REQUIRED` rather than presenting incomplete totals. Release server, worker and web together before activation.
