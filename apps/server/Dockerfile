FROM node:24-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV DATABASE_URL=file:./build.db CI=true HUSKY=0
COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN cd apps/server && pnpm run build

FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
COPY deploy/prepare-volumes.mjs ./deploy/prepare-volumes.mjs
COPY deploy/migrate.mjs ./deploy/migrate.mjs
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/server
RUN DATABASE_URL=file:/tmp/zarbit-image-smoke.db node /app/packages/db/node_modules/prisma/build/index.js migrate deploy --config /app/packages/db/prisma.config.ts \
  && node --input-type=module -e "import { PrismaLibSql } from '@prisma/adapter-libsql'; const db = await new PrismaLibSql({ url: 'file:/tmp/zarbit-image-smoke.db' }).connect(); await db.queryRaw({ sql: 'SELECT 1', args: [], argTypes: [] }); await db.dispose();"
EXPOSE 3000
CMD ["node", "dist/index.mjs"]
