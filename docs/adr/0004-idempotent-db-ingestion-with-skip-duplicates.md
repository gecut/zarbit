# ADR 0004: Multi-Session Ingestion Idempotency via Database Constraints

## Context and Decision

Up to 20 concurrent Telegram MTProto user sessions in the worker observe the same target Telegram group. When a quote, receipt, or human trading action is posted, multiple sessions may receive the event simultaneously and attempt to persist it.

Rather than coordinating through distributed locks or an external message broker, idempotency is enforced directly at the PostgreSQL layer:

- `QuoteHistory` enforces `UNIQUE(sourceMessageId)`.
- `Trade` and `TradingAction` enforce `UNIQUE(chatId, sourceMessageId)`.
- Inserts execute with `skipDuplicates: true`. The first session commits the row (`count === 1`), while subsequent concurrent sessions safely receive `count === 0` and discard the duplicate without throwing errors.

## Consequences

- Eliminates distributed lock contention, Redis dependencies, and inter-session coordination overhead.
- Safe under worker crashes and high-concurrency event bursts.
- Ingestion operations must remain pure database inserts without outbound side-effects inside the insert block.
