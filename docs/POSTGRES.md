# Zarbit — managed PostgreSQL

## Provider requirements

Provision a dedicated PostgreSQL database in the same region as Dokploy. Require TLS, enable PITR/backups and provider monitoring, and allow inbound database traffic only from Dokploy's documented egress addresses or private network. Do not put PostgreSQL or PgBouncer in the Zarbit Compose file.

The managed plan must allow at least 15 simultaneous connections. Zarbit uses direct TLS connections: up to five each for the server and worker, plus the short-lived migration job. Keep exactly one server and one worker.

## Roles

Connect as the provider's administrative role and create the roles with strong, distinct passwords. Replace the placeholders before running this SQL; do not commit or log the resulting URLs.

```sql
CREATE ROLE zarbit_migrator LOGIN PASSWORD '<migrator-password>';
CREATE ROLE zarbit_app LOGIN PASSWORD '<app-password>';

GRANT CONNECT ON DATABASE zarbit TO zarbit_migrator, zarbit_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO zarbit_migrator;
GRANT USAGE ON SCHEMA public TO zarbit_app;
```

`zarbit_migrator` owns migrations. The PostgreSQL baseline grants `zarbit_app` CRUD on baseline tables and default CRUD on future migrator-owned tables. The application role is deliberately not granted schema `CREATE` or ownership.

Create two direct TLS URLs with `sslmode=require` (or the provider's stricter verified-ca/verified-full parameters):

```text
DATABASE_URL=postgresql://zarbit_app:<app-password>@<host>:5432/zarbit?sslmode=require
MIGRATION_DATABASE_URL=postgresql://zarbit_migrator:<migrator-password>@<host>:5432/zarbit?sslmode=require
```

Place both in Dokploy secrets. Compose passes only `MIGRATION_DATABASE_URL` to `migrate`; server and worker receive only `DATABASE_URL`.

## Baseline and routine migrations

The `20260905010000_postgresql_baseline` migration is for an empty PostgreSQL database only. It intentionally does not replay SQLite history or import SQLite rows. Run `prisma migrate deploy` with the migration URL, then `prisma migrate status` with the same URL. Do not use `prisma db push` in production.

For each future change: create and review a normal PostgreSQL migration with the migrator role in a disposable database, publish an immutable image, and deploy it through the Compose `migrate` job. The job exits before server/worker start.

## Observability

Monitor provider connection count, saturation, transaction latency, locks, storage, replication/PITR status, CPU, and failed logins. Zarbit logs per-process pool total/idle/waiting counters only on database failures and exposes query-backed health endpoints. It does not emit database URLs, credentials, SQL parameters, Telegram authorization, or session contents.
