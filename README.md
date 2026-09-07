# Zarbit

Private Persian/RTL Telegram Mini App that shows the latest quote received from one fixed group and publisher. Each allowlisted user connects their own Telegram account with phone → code → optional two-step password. QR is removed. The worker alone owns all MTProto sessions.

## Development

Use Node.js 24 and pnpm 10.26.0. Provision PostgreSQL first; see [docs/POSTGRES.md](docs/POSTGRES.md). Configure apps/server/.env and apps/worker/.env from their examples with the same `DATABASE_URL` and `WORKER_INTERNAL_TOKEN`; configure apps/web/.env with VITE_SERVER_URL. The root .env is only for Docker Compose, not shared application configuration.

Install with pnpm install. Generate Prisma with pnpm run db:generate. Apply migrations with `MIGRATION_DATABASE_URL` explicitly set, using `pnpm --filter @zarbit/db exec prisma migrate deploy`; run the server and worker only with `DATABASE_URL`. Then pnpm run dev starts the apps. The web development port is 3001, server 3000, worker's private command port 3002.

## Build and deploy

Set the GitHub Actions repository variable VITE_SERVER_URL to the actual public HTTPS API URL before publishing. CI applies and verifies the PostgreSQL baseline, runs integration tests, typechecks, and builds. The publish workflow creates web/server/worker images for amd64 and arm64. Final server image stages validate Prisma's PostgreSQL adapter without connecting to production.

Use docker-compose.production.yml in Dokploy and the values from deploy/compose.env.example in its Environment UI. No Traefik labels are required. Configure domains for web port 80 and server port 3000. Do not expose worker port 3002.

**This is a clean PostgreSQL cutover, not an in-place SQLite upgrade.** Stop the old services, snapshot and detach the legacy SQLite and Telegram-session volumes for seven days, then deploy the new release with the fresh `zarbit-telegram-sessions-postgres` volume. Existing users log in again. Never delete legacy volumes automatically.

VITE_SERVER_URL is embedded into the web image; changing a runtime Dokploy variable cannot update an already-built frontend. Choose one immutable IMAGE_TAG across all services.

Detailed steps and recovery: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Checks

Run `pnpm run test`, `pnpm run check-types`, and `pnpm run build` with PostgreSQL URLs and a public HTTPS `VITE_SERVER_URL`. Builds and database tests are not proof of Telegram behavior; the owner performs live-account acceptance.

## Architecture references

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Business rules](docs/BUSINESS-RULES.md)
- [Telegram integration](docs/TELEGRAM.md)

Shared packages: contracts (Zod/DTOs), domain (prices/parser/message builders), db (Prisma/PostgreSQL), env (service configuration), config (TypeScript). Bot launches the Mini App and sends notifications only. Codes/passwords must never be sent to the bot or shared in bug reports.
