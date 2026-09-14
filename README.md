# Zarbit

Private Persian/RTL Telegram Mini App for Iranian OTC gold trading intelligence and execution. Zarbit connects to a fixed trading group and authoritative management bot, providing an official quote & trade terminal, recent trades tape, active order radar, and a 7-day rolling trader analytics leaderboard. Each allowlisted user connects their own Telegram account via phone → code → optional two-step verification password. The worker alone owns all MTProto sessions.

## Development

Requires Node.js 24 and pnpm 10.26.0.

1. **Database**: Provision PostgreSQL 16+ (see [docs/POSTGRES.md](docs/POSTGRES.md)).
2. **Environment**:
   - Configure `apps/server/.env` and `apps/worker/.env` using their `.env.example` templates, setting identical `DATABASE_URL` and `WORKER_INTERNAL_TOKEN` values.
   - Configure `apps/web/.env` with `VITE_SERVER_URL` (e.g. `http://localhost:3000` in dev).
   - The root `.env` is used for Docker Compose, not shared package configuration.
   - For local web development outside Telegram, set `DEV_TELEGRAM_USER_ID` to an ID listed in `ALLOWED_TELEGRAM_USER_IDS`.
3. **Install & Migrate**:
   ```bash
   pnpm install
   pnpm run db:generate
   MIGRATION_DATABASE_URL="postgresql://..." pnpm --filter @zarbit/db exec prisma migrate deploy
   ```
4. **Run Services**:
   ```bash
   pnpm run dev
   ```
   - Web: `http://localhost:3001`
   - Server: `http://localhost:3000` (OpenAPI spec at `/api/openapi.json`)
   - Worker: private internal HTTP at `http://localhost:3002`

## Build and deploy

- Set the repository build variable `VITE_SERVER_URL` in GitHub Actions before building images; the web client embeds this URL at build time.
- In Dokploy, deploy using `compose.yml` with environment values from `deploy/compose.env.example`.
- Route public domains to `web:80` (Mini App) and `server:3000` (API). Do not expose the worker port (3002).
- The `migrate` service in `compose.yml` runs automatically on release cutover, applying migrations and preparing session volume permissions before server and worker start.
- Full operational procedures, health checks, and rollback instructions: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Verification

Run project checks:

```bash
pnpm run test
pnpm run check-types
pnpm run build
```

Live Telegram behavior (login, 2FA, message reception, and order dispatch) requires acceptance testing by the owner with real accounts in a controlled group.

## Documentation

- [Product Specification](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Business Rules](docs/BUSINESS-RULES.md)
- [Telegram Integration](docs/TELEGRAM.md)
- [PostgreSQL Architecture](docs/POSTGRES.md)
- [Dokploy Operations](docs/OPERATIONS.md)
- [RPC Contracts](docs/RPC.md)
- [Market Data Specification](docs/MARKET-DATA.md)
- [Product Roadmap](docs/ROADMAP.md)
- [Home Page Feature Specification](docs/HOME-PAGE-FEATURES.md)
- [Telegram Room Protocol](docs/GROUP-TRADING-PROTOCOL.md)

Never send phone codes, passwords, or authentication secrets to the bot, or include them in bug reports or logs.
