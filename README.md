# Zarbit

Zarbit is a private Telegram Mini App for one-shot gold-price alerts and trades. Each allowlisted user connects only their own Telegram account by QR; the worker sends their matching order from that same account.

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

Set the GitHub Actions repository variable `VITE_SERVER_URL` before publishing, for example `https://api.example.com`. It is embedded into the web image at build time; changing a Dokploy runtime variable cannot change it. The web Docker build now fails if this value is absent. The workflow uses the repository `GITHUB_TOKEN`; no registry secret is stored in the repository.

For Dokploy, add the values from [compose.env.example](/Users/mm25zamanian/Codes/zarbit/deploy/compose.env.example) in the Compose Environment UI. Dokploy writes them to `.env`, which the production compose injects into its runtime services. For a non-Dokploy host, copy that file to `.env`, replace every placeholder, then run:

```bash
docker compose -f docker-compose.production.yml up -d
```

The `migrate` service applies Prisma migrations before server and worker start. `zarbit-data` persists SQLite and `zarbit-telegram-sessions` is shared only by server and worker for per-user MTProto SQLite sessions. Never expose or back up these session files outside the protected deployment volume.

For Dokploy, configure domains in its UI: route the `web` service to port `80` and the `server` service to port `3000`. The compose intentionally has no Traefik labels, host port bindings, or external network dependency. Set `CORS_ORIGIN` to the final public Mini App origin before deployment.

## Environment

Server and worker configuration is parsed by `packages/env`. Development defaults allow builds without production credentials. Telegram secrets must only be supplied through deployment environment variables; never commit them.

`TELEGRAM_API_ID` and `TELEGRAM_API_HASH` are global product credentials created by the product owner at my.telegram.org; they are not user credentials. Each end user authorizes a separate QR-only MTProto session. The server rejects a QR login when its Telegram user ID differs from the validated Mini App identity, and the worker verifies group membership again immediately before execution. `ALLOWED_TELEGRAM_USER_IDS` remains a restart-required allowlist.

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

The bot only launches the Mini App and sends private notifications. It never receives OTPs or performs MTProto login.
