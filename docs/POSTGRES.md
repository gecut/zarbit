# Zarbit — PostgreSQL

Use one PostgreSQL user for migration and runtime. In Dokploy's internal PostgreSQL service, use its internal host and do not add `sslmode=require`; that service does not provide TLS by default.

```text
DATABASE_URL=postgresql://postgres:<password>@<dokploy-db-host>:5432/<database>
MIGRATION_DATABASE_URL=postgresql://postgres:<password>@<dokploy-db-host>:5432/<database>
```

Store both values in Dokploy. Compose passes `MIGRATION_DATABASE_URL` only to `migrate`; server and worker receive only `DATABASE_URL`. The values are intentionally identical.

`20260905010000_postgresql_baseline` requires an empty database. It does not replay SQLite history or import SQLite rows. Run `prisma migrate deploy`, then `prisma migrate status`. Do not use `prisma db push` in production.

Dokploy database and Zarbit containers must share external `dokploy-network`. Keep one server and one worker. Each runtime process uses at most five direct PostgreSQL connections.

## Market data schema and retention

Phase 1 persists four market entities in PostgreSQL: `QuoteHistory` (baseline), `Participant`, `TradingAction`, and `Trade`. All message-based tables enforce `sourceMessageId UNIQUE` for multi-session ingestion idempotency.

- **Retention:** `Trade` records are **permanently retained** and must never be pruned. The 7-day rolling window is strictly an analytics query filter for leaderboards and trader performance.
- **Latest trade derivation:** The dashboard derives the latest completed trade price directly from `Trade` using an indexed scan on `@@index([announcedAt, sourceMessageId])`. No duplicate latest-trade table or singleton is permitted.
- **Participants:** Canonical primary key is the bot-emitted participant alias (`Participant.id`). No `ParticipantAlias` table is introduced.
