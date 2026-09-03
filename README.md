# Zarbit

Zarbit is a private Telegram Mini App foundation for gold-price request automation. This repository currently contains the implementation foundation only; product workflows and Telegram automation are intentionally deferred.

## Stack

- `apps/web`: React, Vite, TanStack Router, TanStack Query, HeroUI
- `apps/server`: Node.js and Hono HTTP API foundation
- `apps/worker`: Node.js worker foundation prepared for mtcute
- `packages/db`: Prisma with SQLite
- `packages/env`: typed, centralized environment contracts
- pnpm workspaces and Turborepo

## Getting started

```bash
pnpm install
pnpm run dev
```

The web app is served at `http://localhost:3001` and the Hono foundation at `http://localhost:3000`.

## Checks

```bash
pnpm run build
pnpm run check-types
```

SQLite/Prisma helpers are available through `db:push`, `db:generate`, `db:migrate`, and `db:studio` scripts in the root package.

## Container deployment

`.github/workflows/publish-containers.yml` verifies the workspace and publishes three multi-architecture images to GHCR on pushes to `main` and version tags:

```text
ghcr.io/<owner>/<repository>-web
ghcr.io/<owner>/<repository>-server
ghcr.io/<owner>/<repository>-worker
```

Set the repository variable `VITE_SERVER_URL` before publishing so the web image points at the public API URL. The workflow uses the repository `GITHUB_TOKEN`; no registry secret is stored in the repository.

The complete variable reference is [.env.example](/Users/mm25zamanian/Codes/zarbit/.env.example). On the deployment host, copy `deploy/compose.env.example` to `.env`, copy `deploy/server.env.example` and `deploy/worker.env.example` to the corresponding runtime env files, replace the domain and credential placeholders, then run:

```bash
docker compose -f docker-compose.production.yml up -d
```

The worker currently stays alive as an idle foundation process until Telegram behavior is implemented. `zarbit-data` persists SQLite and `zarbit-worker-session` is reserved for the future mtcute session.

The Dokploy compose uses the external `dokploy-network` and explicit Traefik labels. Add DNS A records for `WEB_DOMAIN` and `API_DOMAIN`. Use these labels as the routing source, or remove them and configure Dokploy's Domains UI—do not configure both for the same router. No host `ports` mapping is used, so it does not collide with other applications; Traefik routes to container ports 80 and 3000.

## Environment

Server and worker configuration is parsed by `packages/env`. Development defaults allow builds without production credentials. Telegram secrets must only be supplied through deployment environment variables; never commit them.

Expected future variables include `DATABASE_URL`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, `QUOTE_SENDER_ID`, and `ALLOWED_TELEGRAM_USER_IDS`.

## Project structure

```text
apps/
  web/
  server/
  worker/
packages/
  config/
  db/
  env/
```

Business domain models, Mini App authentication, grammY behavior, mtcute sessions/listeners, quote processing, and trade execution belong to subsequent implementation goals.
