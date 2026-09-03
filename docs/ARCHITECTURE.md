# Zarbit — Architecture

> Status: Target architecture.
> Primary goal: keep the system small, explicit, and easy for Codex/LLM agents to maintain.

## 1. Target Stack

### Frontend

- React
- Vite
- TanStack Router
- TanStack Query
- HeroUI
- TypeScript

### Backend

- Node.js
- Hono
- Prisma
- SQLite

### Telegram

- `mtcute` for the MTProto self-bot worker
- `grammY` for the normal Telegram Bot API integration

### Repository / Tooling

- pnpm workspace
- Turborepo
- TypeScript strict mode
- Docker
- Dokploy

## 2. Current Repository Baseline

The existing Better-T-Stack scaffold already contains:

```text
apps/
  server/
  web/

packages/
  config/
  db/
  env/
  ui/
```

A new application must be added:

```text
apps/
  worker/
```

Target logical structure:

```text
apps/
  web/       # React + Vite + TanStack Router Mini App
  server/    # Hono HTTP API + grammY integration
  worker/    # long-running mtcute MTProto connection

packages/
  config/    # shared TypeScript/tooling configuration
  db/        # Prisma schema/client + SQLite access
  env/       # typed environment contracts
```

Only create additional shared packages when a real cross-application need appears.

## 3. Important Scaffold Cleanup

The current scaffold contains a `packages/ui` package populated with shadcn-style components.

The product decision is HeroUI.

Therefore the implementation agent must choose one clean end state:

1. remove the generated shadcn UI package if unused; or
2. replace it with a deliberately designed shared HeroUI layer only if sharing UI primitives across apps becomes useful.

Do not keep two UI systems by default.

The preferred MVP is to use HeroUI directly inside `apps/web` unless a shared UI package becomes justified.

## 4. Application Responsibilities

### 4.1 `apps/web`

Responsibilities:

- Telegram Mini App UI;
- Mini App bootstrap;
- authenticated API calls;
- request creation/edit/cancellation;
- displaying request status/history;
- client-side routing;
- client-side query/cache state.

Must not contain:

- mtcute;
- Telegram trading group logic;
- database access;
- trusted authorization decisions;
- trade execution logic.

### 4.2 `apps/server`

Responsibilities:

- Hono API;
- validate Telegram Mini App `initData`;
- allowlist authorization;
- request CRUD;
- grammY bot integration;
- user notifications;
- application-level validation;
- database access through `packages/db`.

Must not directly own the long-running MTProto group listener.

### 4.3 `apps/worker`

Responsibilities:

- connect a single Telegram user account using mtcute;
- persist/reuse Telegram session data;
- listen to the configured group;
- accept quote messages only from the configured source;
- parse quote messages;
- find matching active requests;
- atomically claim each request;
- execute alert/buy/sell behavior;
- update request status.

This process is long-running and must have a single active replica in MVP.

## 5. Data Flow

```text
                  Telegram
        +------------+-------------+
        |                          |
        | Bot API                  | MTProto
        v                          v
   grammY / Server            mtcute / Worker
        |                          |
        |                          | quote
        |                          v
        |                     Quote Parser
        |                          |
        |                          v
        |                    Request Matcher
        |                          |
        +------------+-------------+
                     |
                     v
                  SQLite
                     ^
                     |
                 Prisma
                     ^
                     |
                  Hono API
                     ^
                     |
               Mini App / Web
```

## 6. Domain Boundary

Telegram libraries are adapters, not the business domain.

Prefer:

```text
mtcute update
  -> normalize/parse
  -> domain quote
  -> request matching
  -> execution decision
  -> Telegram adapter
```

Business rules should be testable/readable without understanding mtcute internals.

Likewise, web UI should communicate through API/domain contracts rather than importing server/database implementation.

## 7. Database Choice

SQLite is intentional.

Reasons:

- small user count;
- small data volume;
- low write throughput;
- one deployment environment;
- operational simplicity;
- Prisma support.

A PostgreSQL migration is not part of MVP.

SQLite database files must live on persistent storage in production.

## 8. Concurrency Rule

The system does not need a queue.

It does need one protection:

> one request must never execute twice.

Before an action is executed, the worker must atomically claim an `ACTIVE` request.

Conceptually:

```text
ACTIVE
  -> claimed by one worker execution
  -> action
  -> DONE / FAILED
```

Implementation may use an atomic conditional update or transaction.

Do not introduce Redis/BullMQ solely for this.

## 9. Process Model

Recommended deployment processes:

```text
web
server
worker
```

`worker` requirements:

- one replica;
- long-running;
- restartable;
- persistent mtcute session;
- private/no public HTTP port required unless a health endpoint is intentionally added.

## 10. Environment Configuration

Expected configuration includes:

```env
DATABASE_URL=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_ID=
QUOTE_SENDER_ID=
ALLOWED_TELEGRAM_USER_IDS=
```

Names may be adjusted to match repository conventions, but configuration must remain centralized and typed.

Secrets and IDs that can change by environment must not be duplicated throughout the codebase.

## 11. Code Organization Principles

Prefer feature/domain modules over excessive layers.

Good:

```text
worker/src/
  telegram/
    client.ts
    listener.ts
    messages/
      trade.ts
      alert.ts
      notification.ts
  quote/
    parse-quote.ts
  requests/
    match-requests.ts
    execute-request.ts
```

Avoid architecture such as:

```text
controllers/
services/
repositories/
managers/
handlers/
processors/
factories/
adapters/
ports/
```

for every simple operation.

Use an abstraction only when it removes real duplication or isolates an external boundary.

## 12. LLM / Codex Implementation Rules

When implementing from this document:

1. preserve the existing Better-T-Stack repository conventions where reasonable;
2. do not rewrite the scaffold without a concrete need;
3. add `apps/worker` as a first-class workspace app;
4. keep TypeScript strict;
5. prefer existing workspace config packages;
6. keep dependencies minimal;
7. do not introduce an alternate backend framework;
8. do not replace TanStack Router with Next.js/TanStack Start;
9. do not replace SQLite with PostgreSQL;
10. do not replace mtcute with another MTProto client;
11. do not add a second authentication system;
12. do not add infrastructure that is outside MVP scope.
