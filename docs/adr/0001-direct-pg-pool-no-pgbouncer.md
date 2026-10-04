# ADR 0001: Direct Node PostgreSQL Pool without PgBouncer

## Context and Decision

Zarbit operates a single server and worker topology backed by managed PostgreSQL. Rather than introducing PgBouncer or a shared connection pooler, each Node process directly manages a native `pg.Pool` capped at 5 connections (`DATABASE_POOL_MAX`), wired through `@prisma/adapter-pg`.

PostgreSQL effortlessly handles 10 total active connections with minimal connection overhead, eliminating an extra network hop, transaction state complexities, and deployment failure modes.

## Consequences

- Peak concurrent connections are strictly bounded at 10 across runtime services, leaving ample capacity for migrations and operations.
- Application code must respect short query timeouts (5-second checkout, 30-second idle).
- Any future horizontal scaling of server instances will necessitate re-evaluating connection pooling topology.
