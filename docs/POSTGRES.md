# Zarbit — PostgreSQL

## Connection architecture

Zarbit uses PostgreSQL 16+ as its single primary database. A single PostgreSQL database user is shared by runtime services and the migration maintenance container.

```text
DATABASE_URL=postgresql://postgres:<password>@<db-host>:5432/<database>
MIGRATION_DATABASE_URL=postgresql://postgres:<password>@<db-host>:5432/<database>
```

- In Dokploy, both values are configured in the Environment UI.
- `MIGRATION_DATABASE_URL` is provided exclusively to the `migrate` container.
- `DATABASE_URL` is provided to `server` and `worker`.
- For Dokploy's internal managed PostgreSQL, connect over `dokploy-network` without `sslmode=require` (TLS is disabled on internal container networks by default).

### Connection pooling and sizing

Runtime services instantiate a direct Node `pg.Pool` passed to Prisma via `@prisma/adapter-pg` (see [ADR 0001](adr/0001-direct-pg-pool-no-pgbouncer.md)):

- Connection pool size: capped by `DATABASE_POOL_MAX` (default 5 connections per process).
- Checkout timeout: 5,000 ms (`connectionTimeoutMillis`).
- Idle timeout: 30,000 ms (`idleTimeoutMillis`).
- Total runtime connections: Server (5) + Worker (5) = 10 active query connections.
- Recommended database capacity: 15–20 connections to ensure ample headroom for migrations, maintenance tasks, and operational queries.

## Schema and entities

The database schema (`packages/db/prisma/schema/schema.prisma`) includes these primary persistence models:

1. **`TelegramUser`**: Canonical user record created from verified Mini App identity (`telegramUserId` unique).
2. **`TelegramSession`**: User MTProto session state (`PENDING_OTP`, `ACTIVE`, `NOT_IN_GROUP`, `REVOKED`, `REVOKING`, `ERROR`), connection state (`CONNECTED`, `CONNECTING`, `OFFLINE`, `DEGRADED`), and storage key.
3. **`TelegramOperation`**: Asynchronous Telegram command ledger (`@@id([userId, id])`), tracking operation type, status (`ACCEPTED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCEL_REQUESTED`, `CANCELLED`, `INTERRUPTED`), and timestamps.
4. **`LoginRateLimit`**: Phone and user rate limiting counters for OTP request throttling (max 3 sends per 15-minute window).
5. **`Request`**: Conditional orders and alerts (`condition`: `GTE`/`LTE`, `action`: `ALERT`/`BUY`/`SELL`, `targetPrice`, `units`). Execution phase machine: `WAITING_TRADE` → `CLAIMED` (atomic `claimToken`) → `SENDING` → `DONE`/`FAILED`/`CANCELLED`.
6. **`QuoteHistory`**: Authoritative gold quotes from canonical bot announcements (`compactQuote`, `sourceMessageId` unique).
7. **`Participant`**: OTC market actors identified by canonical bot alias (`id` string). Stores optional unique `telegramUserId` and resolution status (`UNRESOLVED`, `CANDIDATE`, `VERIFIED`, `CONFLICT`, `CONFLICT_FLAGGED`).
8. **`TradingAction`**: Observed human order commands and taker actions (`ORDER_BUY`, `ORDER_SELL`, `TAKE_ALL`, `TAKE_QUANTITY`, `CANCEL`) with effective `side` (`BUY`/`SELL`) and reply context. Enforces `@@unique([chatId, sourceMessageId])`.
9. **`Trade`**: `NORMAL` receipts and synthetic `SETTLEMENT` position closes. `@@unique([chatId, sourceMessageId])` remains for non-null receipt message IDs; SQL separately enforces one synthetic trade per Settlement and participant.
10. **`Settlement`**: Accepted announcement identity, immutable payload hash, bootstrap boundary, application status and coverage review metadata. Composite group/message references prevent synthetic trades from linking across groups.
11. **`FinancialInbox`**: Immutable financial message observations and correction/review state. Transport observations never prove full receipt coverage by themselves.
12. **`GroupIngestionState`**: Durable history cursor, recovery requirement, applied boundary, coverage watermark, financial gate and analytics cache revision.

## Data retention and query semantics

- **Permanent Retention**: Both `Trade` and `QuoteHistory` records are **permanently retained**. They are never automatically pruned or deleted.
- **7-Day Rolling Analytics Window**: The 7-day period is strictly a query filter (`WHERE announcedAt >= NOW() - INTERVAL '7 days'`) used by `analytics.traders` to calculate participant volume, win rate, and realized P&L. It must never be applied as a data retention TTL.
- **Latest Trade Derivation**: The dashboard derives the latest `NORMAL` completed trade directly from `Trade` using an indexed message-ID scan with `LIMIT 1`. Synthetic settlements never become a market head.
- **Idempotency**: Receipt, quote, action, and Settlement messages retain their source-message uniqueness. Synthetic Trades have null `sourceMessageId` and a separate settlement/participant unique index. Concurrent MTProto sessions use durable database idempotency with `skipDuplicates: true` (see [ADR 0004](adr/0004-idempotent-db-ingestion-with-skip-duplicates.md)); transport is not exactly once.

## Migrations

Migrations live in `packages/db/prisma/migrations/`:

- `20260905010000_postgresql_baseline`: Initial PostgreSQL baseline.
- `20260908020000_compact_request_prices`: Compact integer price representation for requests.
- `20260909120000_lifecycle_contracts`: Session and request lifecycle refinements.
- `20260910190000_market_data_foundation`: Market data persistence (`Participant`, `Trade`, `TradingAction`, `QuoteHistory`).
- `20260910200000_participant_identity_resolver`: Identity resolution schema.
- `20260910210000_trading_action_side_and_telegram_uniqueness`: Trade side column and participant Telegram uniqueness index.
- `20260914010000_telegram_operations`: Asynchronous Telegram operations ledger table.

Apply migrations using `prisma migrate deploy` (or `node /app/deploy/migrate.mjs` in Compose). Never run `prisma db push` in production environments.

## Trade-based request processing

- `TradeRequestCursor` stores the last evaluated message ID per group. Existing Trade rows are the durable input; no second trade ledger or external queue is introduced.
- Matching and cursor advancement commit atomically. The group advisory lock also orders receipt inserts against the final send decision. Telegram calls remain outside transactions.
- Request `armedAt` and `armedAfterMessageId` fence creation and editing. Only a strictly later Telegram timestamp and message ID can trigger; ambiguous same-second events are skipped.
- Trigger metadata stores `triggeredPrice`, `triggerSource`, `triggeredTradeId`, `triggeredChatId`, `triggeredMessageId`, and `triggeredAt`. Historical official triggers retain `QUOTE`; new automatic triggers use `TRADE`.
- Migration `20260915010000_trade_request_triggers` rearms active test requests, initializes cursor heads, and preserves all raw market history.
- Run destructive database tests only against an isolated local database whose name ends in `_test`; the suite enforces this guard.
