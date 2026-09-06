# Zarbit — PostgreSQL

Use one PostgreSQL user for migration and runtime. In Dokploy's internal PostgreSQL service, use its internal host and do not add `sslmode=require`; that service does not provide TLS by default.

```text
DATABASE_URL=postgresql://postgres:<password>@<dokploy-db-host>:5432/<database>
MIGRATION_DATABASE_URL=postgresql://postgres:<password>@<dokploy-db-host>:5432/<database>
```

Store both values in Dokploy. Compose passes `MIGRATION_DATABASE_URL` only to `migrate`; server and worker receive only `DATABASE_URL`. The values are intentionally identical.

`20260905010000_postgresql_baseline` requires an empty database. It does not replay SQLite history or import SQLite rows. Run `prisma migrate deploy`, then `prisma migrate status`. Do not use `prisma db push` in production.

Dokploy database and Zarbit containers must share external `dokploy-network`. Keep one server and one worker. Each runtime process uses at most five direct PostgreSQL connections.
