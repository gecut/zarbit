# Zarbit — Dokploy operations

## Before publication

1. Provision managed PostgreSQL in the Dokploy region as described in [POSTGRES.md](POSTGRES.md): TLS, PITR/backups, monitoring, and a Dokploy-only network allowlist.
2. Store same PostgreSQL URL in `MIGRATION_DATABASE_URL` and `DATABASE_URL`. Compose still gives each service only its required variable.
3. Set the GitHub Actions repository variable `VITE_SERVER_URL` to the final API HTTPS origin. The published web bundle cannot read Dokploy runtime variables.
4. Publish all three images from the same revision and choose the same immutable `IMAGE_TAG` for web/server/worker.
5. In Dokploy, use `docker-compose.production.yml`. Copy keys from `deploy/compose.env.example` into Environment and replace placeholders. Generate `WORKER_INTERNAL_TOKEN` with `openssl rand -hex 32`; keep it stable and secret.
6. Set domains in Dokploy: Mini App → web:80, API → server:3000. Worker gets no public domain/port. Set `CORS_ORIGIN` and `WEB_APP_URL` to the Mini App HTTPS origin.

Required runtime values include the bot token, application API ID/hash, group ID, publisher ID, allowlist, internal token, CORS origin, launcher URL, and `DATABASE_URL`. `MIGRATION_DATABASE_URL` is for the migration job only. Remove legacy SQLite `DATABASE_URL=file:...` values and do not attach the old data volume.

## SQLite to PostgreSQL cutover

This is a maintenance-window clean baseline, not a data migration.

1. Stop web, server, and worker for the old release. Confirm no old worker still owns the Telegram sessions. Never use `down -v`.
2. Snapshot the legacy SQLite **and** legacy Telegram-session volumes. Label them with the old image tag and cutover time, detach them from services, and retain them for at least seven days. Do not delete them automatically.
3. Provision the database. Confirm it is attached to Dokploy's external `dokploy-network` and has at least 15 available connections.
4. Add matching `DATABASE_URL` and `MIGRATION_DATABASE_URL`, plus `DATABASE_POOL_MAX=5`, in Dokploy. Deploy the immutable PostgreSQL release with the new `zarbit-telegram-sessions-postgres` volume.
5. Run the `migrate` job once. It receives only `MIGRATION_DATABASE_URL`, creates the reviewed PostgreSQL baseline, prepares the new session-volume ownership, and exits. Confirm `prisma migrate status` is clean.
6. Start web, server, and worker. Server and worker healthchecks must be successful only after their `SELECT 1` query succeeds. Keep one server and one worker.
7. Users must log in to Telegram again. The prior session files are intentionally detached; do not copy them into the new volume.

The migration job is mandatory on future releases too. It never reads legacy SQLite data and does not delete legacy volumes.

## Basic readiness

- Web healthcheck passes; refresh the Mini App or accept its update prompt.
- Server root healthcheck and worker private `/health` both query PostgreSQL. A successful process healthcheck does not prove every Telegram account is connected.
- Container logs use Docker's `local` driver, capped at five 10 MB files per service. Database failures include safe pool total/idle/waiting counters, a failure category, and source code where available; credentials and Telegram secrets are redacted.
- Runtime server and worker use UID 1000. Only the migration maintenance job runs as root to initialize the **new session volume**. The server must not mount that volume or receive Telegram API ID/hash.
- Provider monitoring shows connections below the configured caps, healthy backups/PITR, normal latency, and no sustained lock contention.

GitHub Actions runs the PostgreSQL baseline, migration status, integration tests, typecheck, and build. Local Docker/image execution and real Telegram behavior still require deployment-environment acceptance.

## Owner's Telegram check

Begin with a controlled group and no financially consequential requests. Open from the allowlisted account, enter its own number, verify code and optional 2FA, then check membership. Verify actual quote reply account/message/price, loss of membership, revoked session and disconnect. Confirm a second account cannot see or execute the first account's requests. Restart the worker and confirm recovery of ready state and unfinished claim safety.

Telegram decides code delivery; an unsupported delivery flow produces an error instead of QR fallback. Start the bot once so notifications can be delivered. Never send OTP or 2FA to the bot or in a bug report.

## Troubleshooting and rollback

- Missing config: worker logs missing **key names**. Check explicit Dokploy values and recreate/restart; changing `.env` does not update a running container.
- Database health fails: verify database URL, network, password, provider status, and connection limit. Inspect sanitized pool counters and provider metrics; do not increase the pool cap blindly.
- Migration fails: stop runtime services, correct database state, then rerun `migrate`. Do not use `db push` to bypass migration history.
- Worker unavailable: history and unclaimed cancellation still work; create/edit is blocked. Check private token/URL, database health, network, and worker logs.
- NOT_IN_GROUP: join the configured group manually, then press membership recheck. Old cancelled orders stay cancelled.
- REVOKING: do not delete an open file. Wait for worker logout; if Telegram is unreachable, check network and session status. The user can also revoke Zarbit from Telegram Devices.
- Unknown send result: inspect the triggering group message before creating another request. Never clear claim tokens or bulk-reactivate FAILED requests.
- Rollback before new PostgreSQL activity: stop the new services, restore the old image tag, reattach the two matching legacy volumes, and restore the old Compose environment. Do not run old code against PostgreSQL. After new PostgreSQL activity, rollback requires an explicit data decision; do not discard new activity or overwrite it with SQLite snapshots by default.

For a bug report include the deployed image tag, endpoint/status, time, displayed session state and sanitized error event. Exclude initData, phone number, code, password, API hash, bot/internal token, database URLs, and session files.
