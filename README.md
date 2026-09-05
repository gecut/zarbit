# Zarbit

Private Persian/RTL Telegram Mini App for one-shot price alerts and buy/sell replies. Each allowlisted user connects their own Telegram account with phone → code → optional two-step password. QR is removed. The worker alone owns all MTProto sessions.

## Development

Use Node.js 24 and pnpm 10.26.0. Configure apps/server/.env and apps/worker/.env from their examples with the **same absolute DATABASE_URL** and WORKER_INTERNAL_TOKEN; configure apps/web/.env with VITE_SERVER_URL. The root .env is only for Docker Compose, not shared application configuration.

Install with pnpm install. Generate Prisma with pnpm run db:generate. Apply migrations with DATABASE_URL explicitly set, using pnpm --filter @zarbit/db exec prisma migrate deploy. Then pnpm run dev starts the apps. The web development port is 3001, server 3000, worker's private command port 3002.

## Build and deploy

Set the GitHub Actions repository variable VITE_SERVER_URL to the actual public HTTPS API URL before publishing. CI typechecks and builds; the publish workflow creates web/server/worker images for amd64 and arm64. Final server/worker image stages verify native SQLite dependencies without real Telegram credentials.

Use docker-compose.production.yml in Dokploy and the values from deploy/compose.env.example in its Environment UI. No Traefik labels are required. Configure domains for web port 80 and server port 3000. Do not expose worker port 3002.

**For an existing deployment, stop the old server and worker and back up both volumes before migration.** The migrate service remains mandatory and prepares UID 1000 file ownership. Existing ACTIVE sessions, requests and history are preserved by the new OTP migration. Never change the existing Compose project/volume names during upgrade.

VITE_SERVER_URL is embedded into the web image; changing a runtime Dokploy variable cannot update an already-built frontend. Choose one immutable IMAGE_TAG across all services.

Detailed steps and recovery: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Checks

Run pnpm run check-types and pnpm run build with a public HTTPS VITE_SERVER_URL. No automated unit/integration/E2E suite is included, per the owner's decision. Builds are not proof of Telegram behavior; the owner performs live-account acceptance.

## Architecture references

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Business rules](docs/BUSINESS-RULES.md)
- [Telegram integration](docs/TELEGRAM.md)

Shared packages: contracts (Zod/DTOs), domain (prices/parser/message builders), db (Prisma/libSQL), env (service configuration), config (TypeScript). Bot launches the Mini App and sends notifications only. Codes/passwords must never be sent to the bot or shared in bug reports.
