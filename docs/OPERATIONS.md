# Zarbit — Dokploy operations

## Before publication

1. Set the GitHub repository Actions variable `VITE_SERVER_URL` to the final API HTTPS origin. The published web bundle cannot read Dokploy runtime variables.
2. Publish all three images from the same revision and choose the same immutable `IMAGE_TAG` for web/server/worker. Do not mix old QR and new OTP services.
3. In Dokploy, use `docker-compose.production.yml`. Copy the keys from `deploy/compose.env.example` into Environment and replace placeholders. Preserve the current project and volume names.
4. Generate `WORKER_INTERNAL_TOKEN` with `openssl rand -hex 32`. The Compose file injects the same secret into server and worker. Keep it stable; it also keys anonymized login throttling. Never paste the value into logs or issue reports.
5. Set domains in Dokploy: Mini App → web:80, API → server:3000. Worker gets no public domain/port. Its backend network needs Telegram egress. Set CORS_ORIGIN and WEB_APP_URL to the Mini App HTTPS origin.

Required runtime values: bot token, application API ID/hash, group ID, publisher ID, allowlist, internal token, CORS origin and launcher URL. DATABASE_URL, WORKER_INTERNAL_URL and session paths are already wired by Compose. Remove old WORKER_KEEP_ALIVE, QR variables, WEB_DOMAIN, API_DOMAIN and TRAEFIK_CERT_RESOLVER; Dokploy owns domain routing.

## Upgrade from the QR version

This is a maintenance-window upgrade, not rolling deployment.

1. Stop web, server and worker of the old version. Ensure no second worker is using the volumes. Never run `down -v` or delete volumes.
2. With writers stopped, back up **both** named volumes together: application SQLite and MTProto sessions, including existing journal/WAL sidecars. Use Dokploy's volume backup or a protected host backup. Determine actual mounted volume names from the existing services; do not guess a project prefix. Encrypt backups and restrict access: session files grant Telegram account access.
3. Keep the previous image tag and record the applied Prisma migration list. Existing installs must already have the first two migrations marked as applied. If they contain tables without that history, stop and resolve migration baselining; do not run the old reset migration blindly.
4. Pull the new images. Run the explicit migrate service before serving traffic. On a standalone host: `docker compose -f docker-compose.production.yml run --rm migrate`. In Dokploy the service dependency is also configured to run it before server/worker start.
5. The job adjusts only recognized database/session files to UID/GID 1000, prepares 0700 directories and applies pending migrations. It refuses a lock held by a current-version worker. The pre-OTP worker has no such lock, so step 1 is mandatory.
6. Start the new server, worker and web. A successful migrate job exits 0; do not remove it from Compose. Future releases still need it. Running it again after success applies no already-recorded migration.

The new migration preserves ACTIVE sessions and request/history rows. Incomplete QR enrollment becomes ERROR. On worker recovery, incomplete OTP is expired, recognized orphan session files are cleaned only under exclusive ownership, and unfinished request claims become FAILED with an unknown-result warning. Cancelled requests never reactivate.

## Basic readiness

- Web healthcheck must pass; refresh the Mini App or accept its update prompt. Hashed assets are immutable, while index.html and sw.js revalidate.
- Server healthcheck reads SQLite. A healthy server does not imply that every Telegram account is connected.
- Worker healthcheck checks its private HTTP process. Per-account connection/membership is shown in the Mini App; no global readiness claim substitutes for it.
- Container logs use Docker's `local` driver, capped at five 10 MB files per service. Worker stacks use source maps and include the deployed `IMAGE_TAG`; inspect the preceding `telegram.login.failed` event for a safe failure category and source code before the public error is normalized.
- Runtime server and worker use UID 1000. Only the migration maintenance job runs as root for ownership repair. The server must not mount the session volume or receive TELEGRAM_API_ID/HASH.
- Keep a single worker replica. A second worker must fail on the session-volume lock. Use local persistent volumes with reliable SQLite locking, not NFS.

Automated test suites are intentionally absent. Typecheck/build and final-image native checks remain in the publication path. Local Docker/image execution and real Telegram behavior must be confirmed in the deployment environment.

## Owner's real Telegram check

Begin with a controlled group and no financially consequential requests. Open from the allowlisted account, enter its own number, verify code and optional 2FA, then check membership. Verify actual quote reply account/message/price, loss of membership, revoked session and disconnect. Confirm a second account cannot see or execute the first account's requests.

Telegram decides code delivery; an unsupported delivery flow produces an error instead of QR fallback. Start the bot once so notifications can be delivered. Never send OTP or 2FA to the bot or in a bug report.

## Troubleshooting and rollback

- Missing config: worker logs missing **key names**. Check explicit Compose values and recreate/restart; changing `.env` does not update a running container.
- Worker unavailable: history and unclaimed cancellation still work; create/edit is blocked. Check private token/URL, network and worker logs.
- NOT_IN_GROUP: join the configured group manually in Telegram, then press membership recheck. Old cancelled orders stay cancelled.
- REVOKING: do not delete an open file. Wait for worker logout; if Telegram is unreachable, check network and session status. The user can also revoke Zarbit from Telegram Devices.
- Unknown send result: inspect the triggering group message before creating another request. Never clear claim tokens or bulk-reactivate FAILED requests.
- Rollback: stop all new services; restore the matching pre-upgrade backup of **both** volumes and the previous images. Do not run the old code against the new schema. Reconcile any orders sent since backup before enabling execution; blindly restoring old ACTIVE requests could repeat trades. After real Telegram logout/revocation, an old local file cannot restore remote authorization—login again.

For a bug report include the deployed image tag, endpoint/status, time, displayed session state and sanitized error event. Exclude initData, phone number, code, password, API hash, bot/internal token and session files.
