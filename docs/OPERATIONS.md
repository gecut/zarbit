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

## Deploying trade-based request triggers

1. Stop the Worker and temporarily stop request admission on the Server. Do not overlap old and new Worker versions.
2. Apply migration `20260915010000_trade_request_triggers` through the existing migrate service. Never use db push. QuoteHistory and Trade rows are not rewritten or removed.
3. Deploy Server and Web together, require old web tabs/PWA clients to reload, and start the new Worker. Existing waiting test requests adopt the new basis; cursor initialization prevents historical replay.
4. Verify `request.trade_trigger.evaluated`, `request.trade_trigger.processing`, and `request.returned_to_waiting_or_cancelled` events. Logs contain request/message IDs and decision reasons, not credentials or raw receipt text.

A 30-second periodic scan complements immediate receipt wakeups. The cursor and claims commit together. On restart, unsent TRADE claims are resumed and revalidated; unsent manual/legacy claims return to waiting. SENDING or a recorded delivery start becomes UNKNOWN, is reported once by recovery, and is never resent automatically. Failures after sending but before storing completion also require reconciliation, not retry. Processing drains before sessions and the database close.

Rollback must be coordinated: stop Worker and admission first. The old binary is incompatible with WAITING_TRADE and the renamed request fields; do not point it at the migrated schema. Prefer a forward fix. Restoring an old application requires a reviewed schema rollback or pre-release backup restoration, with explicit accounting for any sends after the backup.

## Settlement release and manual coverage review

Settlement ingestion is disabled by default (`SETTLEMENT_ENABLED=false`). Do not enable it until the exact raw successful Telegram announcement, numeric chat ID, numeric sender ID, message ID and Telegram timestamp have been captured, the parser has been finalized against that evidence, and the migration state is known in every target environment. The sender must match `SETTLEMENT_SENDER_ID`; a display name is not authentication. No settlement path sends an order to Telegram.

Before release, check `_prisma_migrations` for `20260920010000_settlement_foundation`. If it has already been applied anywhere, preserve the applied SQL file and ship any correction as a later migration. Rehearse on an empty database and a historical copy; take a restorable backup/PITR point. Stop and drain the old worker, apply the additive migration through the existing migrate service, and deploy server, worker and web from one compatible immutable `IMAGE_TAG`. Regenerate Prisma Client during build. Keep the feature gate off until every old worker is stopped and old web clients are reloaded. Verify the built server and worker `dist` external imports against their runtime images.

Set `SETTLEMENT_BOOTSTRAP_MESSAGE_ID` to the verified first trusted announcement ID. At startup and reconnection the coordinator closes the durable gate, reads the current group head, and scans from the saved history cursor (or immediately before the configured bootstrap message) through that fixed head. This discovers announcements missed while offline. The 10,000-message safety limit or inaccessible history leaves `historyRecoveryRequired=true`; do not advance the cursor manually to bypass incomplete recovery. Resolve access or perform a separately reviewed bounded recovery. A successful scan advances the cursor but does not certify receipt coverage.

The first accepted Settlement creates a zero-position boundary without speculative closes. A later Settlement remains pending until Telegram history catch-up completes and a human verifies receipt coverage for the interval between the two message IDs. An ID gap alone is not missing-receipt evidence. On an authorized operator host with repository source and database access, run `pnpm --filter worker settlement:review inspect <chatId> <messageId>` to view the interval digest, scan watermark and unresolved observations. Compare the immutable inbox, accessible group history and normal trades, including deleted/edited/late messages. Only after independent coverage review, run `SETTLEMENT_REVIEW_EXECUTE=1 pnpm --filter worker settlement:review apply <chatId> <messageId> <digest> <reviewer>`. The digest binds approval to the exact observed interval; a new observation invalidates it. This command is never run automatically by the worker.

If a receipt with an ID before an applied boundary arrives later, or an accepted announcement is edited/deleted, the financial gate enters review and request dispatch is paused. Preserve the original message and inbox observations. Reconcile the Telegram evidence, involved positions and P&L manually; do not insert the receipt silently or rewrite the accepted Settlement automatically. A worker restart replays pending observations idempotently, but inaccessible history keeps the gate closed. The system does not claim exactly-once Telegram delivery or prove that deleted unseen messages never existed.

`settlement:review apply` deliberately rejects an already applied or conflicting Settlement. Resolving a flagged historical interval requires a separately reviewed reconciliation transaction and audit record; clearing an inbox error or gate flag alone is not reconciliation.

After a synthetic trade has been committed, rolling back only an image is unsafe: an older server or worker may treat the synthetic price as a market trade. Prefer a forward fix; a database restore requires a coordinated review of requests and external sends since the backup. Analytics caches use the persisted ingestion revision so an accepted boundary or review changes the cache key.

Validation: use a separate local PostgreSQL test database, apply all migrations, run DB tests and worker integration tests, then browser tests and package gates. A transport stub proves internal execution behavior; it does not prove live Telegram group delivery.

Offline edits/deletions of already completed NORMAL receipt intervals are not exhaustively re-scanned automatically. Before every coverage approval, catch-up compares the current interval's persisted observations with accessible history; accepted Settlement announcements are reconciled on reconnect. For closed historical receipt intervals, the operator must reconcile the affected interval on reported corrections or a Telegram outage, preserve a review record, and close the gate pending reconciliation. Basic-group delete updates without a chat identity cannot be safely attributed; the live delete listener handles channel/supergroup updates only. Ignored events are not reviewed events.

Local rehearsal with Prisma 7.10.0 found pre-existing `Request` drift: migrations retain `claimedAt` and `(userId,status,createdAt,id)`, while the current schema omits that column and declares different request indexes. Settlement models match the migrated database. Resolve or explicitly account for this baseline discrepancy before generating future migrations; do not use schema push to erase it during Settlement release. Local PostgreSQL rehearsal used 14.20, not the production PostgreSQL 16 runtime.
