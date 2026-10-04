# Zarbit Architecture and Operational Documentation

Authoritative documentation repository for Zarbit, an Iranian OTC gold trading intelligence and execution platform.

> [!IMPORTANT]
> All product, architectural, and operational contracts documented here are binding. Agents and engineers must consult these documents as the single source of truth; never guess schemas, boundaries, or business logic.

---

## Documentation Map

| Document | Primary Role | Trigger / When to Consult |
| :--- | :--- | :--- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System boundaries, process topology, connection pooling, deployment networks | Modifying service boundaries, adding inter-process endpoints, or altering connection topology |
| [`GLOSSARY.md`](GLOSSARY.md) | Ubiquitous language for OTC gold trading, compact pricing, and avoided aliases | Introducing or refactoring domain terms, naming entities, or resolving terminology conflicts |
| [`BUSINESS-RULES.md`](BUSINESS-RULES.md) | Invariants, pricing conversions, 7-day FIFO accounting, identity thresholds | Modifying P&L formulas, order trigger logic, or identity verification criteria |
| [`GROUP-TRADING-PROTOCOL.md`](GROUP-TRADING-PROTOCOL.md) | Telegram group message structures (quotes, receipts, active orders, actions) | Changing message parsers, regexes, normalization routines, or protocol definitions |
| [`TELEGRAM.md`](TELEGRAM.md) | MTProto worker architecture, session SQLite storage, OTP lifecycle, execution | Updating Telegram login flow, session locking, MTProto commands, or order transmission |
| [`RPC.md`](RPC.md) | oRPC v1.15 contracts, data planes, cache ownership, rate limits, batching | Adding/editing RPC endpoints, configuring client query hooks, or adjusting cache TTLs |
| [`POSTGRES.md`](POSTGRES.md) | Database models, pool limits, migrations, permanent retention semantics | Changing Prisma schema, creating migrations, or tuning database query parameters |
| [`MARKET-DATA.md`](MARKET-DATA.md) | In-memory cache structures, snapshot monotonic merge, head derivations | Refining market feeds, real-time quote/trade aggregation, or cache synchronization |
| [`PRODUCT.md`](PRODUCT.md) | Telegram Mini App specifications, user journeys, navigation tabs, UI design | Building or refactoring UI components, theme logic, or user-facing features |
| [`OPERATIONS.md`](OPERATIONS.md) | Dokploy deployment, Compose topology, environment variables, health checks | Deploying to staging/production, configuring environments, or diagnosing container health |
| [`ROADMAP.md`](ROADMAP.md) | Strategic product roadmap across Phase 1, Phase 2, and Phase 3 | Scoping feature releases or verifying whether a capability is supported in the current phase |
| [`adr/`](adr/) | Architectural Decision Records capturing non-reversible choices and trade-offs | Reviewing why foundational architectural patterns and constraints exist |

---

## Architectural Decision Records (ADRs)

Key architectural decisions recorded per [`domain-modeling`](../.agents/skills/domain-modeling/SKILL.md) and [`grill-with-docs`](../.agents/skills/grill-with-docs/SKILL.md):

- [ADR 0001: Direct Node PostgreSQL Pool without PgBouncer](adr/0001-direct-pg-pool-no-pgbouncer.md)
- [ADR 0002: Dedicated Worker Ownership of MTProto Sessions](adr/0002-single-worker-ownership-of-mtproto-sessions.md)
- [ADR 0003: Contract-First oRPC Router](adr/0003-contract-first-orpc-router.md)
- [ADR 0004: Multi-Session Ingestion Idempotency via Database Constraints](adr/0004-idempotent-db-ingestion-with-skip-duplicates.md)
- [ADR 0005: Whale Copy Execution on Raw Trading Actions Instead of Trade Receipts](adr/0005-action-copy-over-trade-copy.md)

---

## Monorepo Architecture Overview

```text
zarbit/
├── apps/
│   ├── web/          # React 19, Vite, HeroUI v3, TanStack Router/Query, Persian RTL
│   ├── server/       # Hono API, Mini App initData HMAC & allowlist, shared Market snapshot
│   └── worker/       # MTProto gateway (up to 20 user sessions), SQLite lock, execution engine
├── packages/
│   ├── contracts/    # Shared strict Zod schemas, oRPC v1.15 contracts, DTOs
│   ├── domain/       # Compact pricing math, Persian normalization, parsers, FIFO P&L
│   ├── db/           # Prisma 6 + PostgreSQL client, migration definitions
│   ├── logger/       # Structured Pino JSON logger with redaction
│   └── env/          # Type-safe environment validation contracts
├── docs/             # Authoritative product and technical documentation
└── .agents/skills/   # Standard agent skills and workflows
```
