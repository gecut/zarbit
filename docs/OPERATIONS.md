# Zarbit — Dokploy operations

## Before publication

1. Provision managed PostgreSQL in the Dokploy region as described in [POSTGRES.md](POSTGRES.md): TLS, PITR/backups, monitoring, and a Dokploy-only network allowlist.
2. Store same PostgreSQL URL in `MIGRATION_DATABASE_URL` and `DATABASE_URL`. Compose still gives each service only its required variable.
3. Set the GitHub Actions repository variable `VITE_SERVER_URL` to the final API HTTPS origin. The published web bundle cannot read Dokploy runtime variables.
4. Publish all three images from the same revision and choose the same immutable `IMAGE_TAG` for web/server/worker.
5. In Dokploy, use `docker-compose.production.yml`. Copy keys from `deploy/compose.env.example` into Environment and replace placeholders. Generate `WORKER_INTERNAL_TOKEN` with `openssl rand -hex 32`; keep it stable and secret.
6. Set domains in Dokploy: Mini App → web:80, API → server:3000. Worker gets no public domain/port. Set `CORS_ORIGIN` and `WEB_APP_URL` to the Mini App HTTPS origin.

Required runtime values include the bot token, application API ID/hash, group ID, publisher ID, allowlist, internal token, CORS origin, launcher URL, `DATABASE_URL`, immutable `IMAGE_TAG`, and `LOG_LEVEL=info`. `MIGRATION_DATABASE_URL` is for the migration job only. Remove legacy SQLite `DATABASE_URL=file:...` values and do not attach the old data volume.

## SQLite to PostgreSQL cutover

This is a maintenance-window clean baseline, not a data migration.

1. Stop web, server, and worker for the old release. Confirm no old worker still owns the Telegram sessions. Never use `down -v`.
2. Snapshot the legacy SQLite **and** legacy Telegram-session volumes. Label them with the old image tag and cutover time, detach them from services, and retain them for at least seven days. Do not delete them automatically.
3. Provision the database. Confirm it is attached to Dokploy's external `dokploy-network` and has at least 15 available connections.
4. Add matching `DATABASE_URL` and `MIGRATION_DATABASE_URL`, plus `DATABASE_POOL_MAX=5`, in Dokploy. Deploy the immutable PostgreSQL release with the new `zarbit-telegram-sessions-postgres` volume. The Server also opens one dedicated PostgreSQL connection for `LISTEN zarbit_market_changed`; include that connection in provider capacity and leave migration/headroom capacity outside the runtime pool.
5. Run the `migrate` job once. It receives only `MIGRATION_DATABASE_URL`, creates the reviewed PostgreSQL baseline, prepares the new session-volume ownership, and exits. Confirm `prisma migrate status` is clean.
6. Start web, server, and worker. Server and worker healthchecks must be successful only after their `SELECT 1` query succeeds. Keep one server and one worker.
7. Users must log in to Telegram again. The prior session files are intentionally detached; do not copy them into the new volume.

The migration job is mandatory on future releases too. It never reads legacy SQLite data and does not delete legacy volumes.

## Basic readiness

- Web healthcheck passes; refresh the Mini App or accept its update prompt.
- Server root healthcheck and worker private `/health` both query PostgreSQL. A successful process healthcheck does not prove every Telegram account is connected.
- Container logs use Docker's `local` driver, capped at five 10 MB files per service. Server and worker emit structured Pino JSON with MTProto connection state/DC, operation duration, retry context, and a redacted native error cause chain. `LOG_LEVEL=info` records lifecycle transitions; use `debug` temporarily for high-frequency quote and health events. Credentials, Telegram secrets, numbers, OTPs, passwords, request bodies, and message text are redacted or never emitted.
- Runtime server and worker use UID 1000. Only the migration maintenance job runs as root to initialize the **new session volume**. The server must not mount that volume or receive Telegram API ID/hash.
- Provider monitoring shows connections below the configured caps, healthy backups/PITR, normal latency, and no sustained lock contention.

### Market listener and SSE release gate

The market listener is a single long-lived Server connection outside Prisma's five-connection query pool. It reconnects with bounded backoff, rehydrates current heads after reconnect, and closes before the Server exits. The market stream uses a 15-second transport keepalive and bounded subscriber lifetime/buffers.

Before production release, verify the actual Dokploy/Traefik path in staging for event-stream buffering, compression, idle timeout, HTTP version, health checks, and graceful shutdown. Do not add proxy labels or timeout values without evidence from the deployed path; a successful local SSE smoke test is insufficient.

GitHub Actions runs the PostgreSQL baseline, migration status, integration tests, typecheck, and build. Local Docker/image execution and real Telegram behavior still require deployment-environment acceptance.

## Owner's Telegram check

Begin with a controlled group. Open from the allowlisted account, enter its own number, verify code and optional 2FA, then check membership. Send a valid quote from the configured publisher and verify its compact value is displayed multiplied by 1,000 with the Telegram message timestamp. Check loss of membership, revoked session and disconnect. Restart the worker and confirm the last quote remains available and ready session recovery still works.

Telegram decides code delivery; an unsupported delivery flow produces an error instead of QR fallback. Start the bot once so notifications can be delivered. Never send OTP or 2FA to the bot or in a bug report.

For a rollout of Telegram contract v3, apply the additive migration before starting the coordinated server/worker/web release. Confirm exactly one worker owns the session volume, query `telegram.operation` until revoke cleanup is terminal, and keep any REVOKING record when Telegram is unreachable. A 409 client-version response means the web client must be refreshed through the normal deployment path; no forced reload is required.

## Troubleshooting and rollback

- Missing config: worker logs missing **key names**. Check explicit Dokploy values and recreate/restart; changing `.env` does not update a running container.
- Database health fails: verify database URL, network, password, provider status, and connection limit. Inspect sanitized pool counters and provider metrics; do not increase the pool cap blindly.
- Migration fails: stop runtime services, correct database state, then rerun `migrate`. Do not use `db push` to bypass migration history.
- Worker unavailable: the stored quote remains readable, but no newer quote can be collected. Check private token/URL, database health, network, and worker logs.
- OTP/2FA diagnosis: `telegram.login.failed` with `failureCategory: telegram_rpc` and `sourceCode: SESSION_PASSWORD_NEEDED` is expected for accounts with two-step verification. The matching `telegram.login.password_required` event must follow, and the client receives `login.step: PASSWORD` with HTTP 200. It is not a network outage. `ECONN*`, `ETIMEDOUT`, and `EAI_AGAIN` are `network`; Prisma errors are `database`; `telegram.connection.dc_selected` is normal MTProto DC selection, not a failure.
- NOT_IN_GROUP: join the configured group manually, then press membership recheck.
- REVOKING: do not delete an open file. Wait for worker logout; if Telegram is unreachable, check network and session status. The user can also revoke Zarbit from Telegram Devices.
- Missing quote: verify the group and publisher IDs, then inspect the worker's redacted `telegram.quote.ignored` and `telegram.quote.recorded` events.
- Rollback before new PostgreSQL activity: stop the new services, restore the old image tag, reattach the two matching legacy volumes, and restore the old Compose environment. Do not run old code against PostgreSQL. After new PostgreSQL activity, rollback requires an explicit data decision; do not discard new activity or overwrite it with SQLite snapshots by default.

For a bug report include the deployed image tag, endpoint/status, time, displayed session state and sanitized error event. Exclude initData, phone number, code, password, API hash, bot/internal token, database URLs, and session files.
