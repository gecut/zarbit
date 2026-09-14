# Zarbit — Dokploy Operations

## Deployment setup

1. **Database Provisioning**: Provision managed PostgreSQL 16+ on the same Dokploy host or managed provider. Ensure network access is attached to Dokploy's external `dokploy-network`.
2. **Environment Configuration**: Set `DATABASE_URL` and `MIGRATION_DATABASE_URL` in Dokploy. Compose passes `MIGRATION_DATABASE_URL` exclusively to the `migrate` service; runtime services receive `DATABASE_URL`.
3. **Frontend Build URL**: Configure `VITE_SERVER_URL` in GitHub Actions repository variables to point to the public HTTPS API domain before triggering container builds. The built web bundle embeds this URL immutably.
4. **Image Publishing**: Build and publish `web`, `server`, and `worker` images using the same immutable `IMAGE_TAG`.
5. **Compose Configuration**: In Dokploy, deploy using `compose.yml`. Populate environment variables from `deploy/compose.env.example`. Generate a secure 32-character token for `WORKER_INTERNAL_TOKEN` (e.g. `openssl rand -hex 32`).
6. **Domain Routing**:
   - Mini App frontend: Route domain to `web:80`.
   - API server: Route domain to `server:3000`.
   - Worker: Do **not** assign a public domain or port mapping. The worker is reachable only via the internal `backend` Docker network.

### Required environment variables

| Variable                    | Target Services | Description                                                             |
| --------------------------- | --------------- | ----------------------------------------------------------------------- |
| `IMAGE_TAG`                 | All             | Immutable release tag matching published GHCR images                    |
| `DATABASE_URL`              | server, worker  | PostgreSQL connection URL                                               |
| `MIGRATION_DATABASE_URL`    | migrate         | PostgreSQL connection URL for migrations                                |
| `DATABASE_POOL_MAX`         | server, worker  | Connection pool limit (default `5`)                                     |
| `LOG_LEVEL`                 | server, worker  | Pino logging level (`info` for production, `debug` for troubleshooting) |
| `CORS_ORIGIN`               | server          | Allowed Mini App origin (e.g. `https://app.example.com`)                |
| `WEB_APP_URL`               | server, worker  | Mini App launch URL                                                     |
| `TELEGRAM_BOT_TOKEN`        | server, worker  | Bot token for initData verification and notification dispatch           |
| `ALLOWED_TELEGRAM_USER_IDS` | server, worker  | Comma-separated allowlist of Telegram user IDs                          |
| `WORKER_INTERNAL_TOKEN`     | server, worker  | Shared secret (min 32 chars) for server-to-worker internal API          |
| `TELEGRAM_API_ID`           | worker          | Telegram application API ID                                             |
| `TELEGRAM_API_HASH`         | worker          | Telegram application API Hash                                           |
| `TELEGRAM_GROUP_ID`         | worker          | Target trading group ID (e.g. `-100...`)                                |
| `QUOTE_SENDER_ID`           | worker          | Telegram user ID of the authoritative group management bot              |
| `MAX_TELEGRAM_SESSIONS`     | worker          | Maximum concurrent MTProto user sessions (default `20`)                 |
| `TELEGRAM_SESSIONS_DIR`     | worker          | Container path for session files (default `/sessions`)                  |

## Cutover and migration procedures

### Database migrations

The `migrate` service in `compose.yml` runs automatically before `server` or `worker` start:

1. It executes `node /app/deploy/migrate.mjs` running as user `0:0`.
2. Sets proper directory (`0700`) and file (`0600`) permissions for UID 1000 on `/sessions`.
3. Acquires an exclusive SQLite lock on `/sessions/.worker-owner.sqlite` to prevent migrations while a worker is running.
4. Executes `prisma migrate deploy --config /app/packages/db/prisma.config.ts`.
5. Releases the lock and exits cleanly (`restart: "no"`).

### Volume requirements

- The worker requires one persistent named volume: `zarbit-telegram-sessions-postgres` mounted at `/sessions`.
- This volume stores encrypted SQLite session credentials for authorized MTProto sessions.
- Do not use a network filesystem (NFS/CIFS) that does not support reliable POSIX advisory file locking.

## Health checks and readiness

- **Web Service**: Tested via `wget -q --spider http://127.0.0.1:80/`. Nginx serves production static assets.
- **Server Service**: Tested via HTTP `GET http://127.0.0.1:3000/`. Executes `SELECT 1` against PostgreSQL and returns `OK`.
- **Worker Service**: Tested via HTTP `GET http://127.0.0.1:3002/health`. Executes a database connectivity check and reports MTProto session runtime metrics.
- **Logging**: Containers log structured Pino JSON to stdout. Docker's `local` logging driver caps logs at five 10 MB files per service (`max-size: "10m"`, `max-file: "5"`). Sensitive credentials, tokens, phone numbers, codes, and passwords are never logged.

## Owner Telegram verification checklist

Following deployment, verify live functionality using an allowlisted account:

1. **Open Mini App**: Verify Mini App loads in Telegram without authentication errors.
2. **Account Login**: In Settings (`/telegram`), submit phone number, receive Telegram verification code, and enter 2FA password (if enabled). Confirm session state reaches `ACTIVE`.
3. **Group Membership**: Verify that account is confirmed as a member of the configured trading group.
4. **Market Data Reception**: Confirm that incoming canonical quotes (`🟡 مظنه ... 🟡`) appear on the Home terminal header within 3 seconds, displaying both full Toman formatting and compact integer values.
5. **Trade Feed**: Verify completed trade receipts (`حواله`) appear on the Recent Trades tape and update the Latest Trade display.
6. **Request Lifecycle**: Submit a test Alert or Order. Test «ارسال فوری» (force send) or verify execution when the target quote condition is satisfied.
7. **Session Revocation**: Test session disconnect. Verify the state transitions to `REVOKING`, then `REVOKED`, and local session files are purged.

## Troubleshooting

- **Server returns 503 WORKER_UNAVAILABLE**: Check that worker container is healthy, verify `WORKER_INTERNAL_URL` and matching `WORKER_INTERNAL_TOKEN`.
- **Database health check fails**: Verify database URL, network accessibility on `dokploy-network`, and connection pool exhaustion. Check provider metrics.
- **Worker logs `telegram.authoritative.invalid`**: Group bot format may have changed or non-bot messages are matching keywords. Inspect logged reason.
- **Identity resolution shows CONFLICT**: Contradictory evidence detected linking two different Telegram accounts to the same bot alias. Mapping is frozen to prevent automated errors.
- **Client displays "برنامه را به‌روز کنید" (409)**: Telegram contract version mismatch (`X-Zarbit-Telegram-Contract: 3`). Refresh the Mini App to load the updated frontend bundle.
