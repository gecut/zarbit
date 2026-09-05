FROM node:24-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV DATABASE_URL=postgresql://zarbit:zarbit@127.0.0.1:5432/zarbit?schema=public CI=true HUSKY=0
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
USER node
WORKDIR /app/apps/server
RUN node --input-type=module -e "import { PrismaPg } from '@prisma/adapter-pg'; import { Pool } from 'pg'; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); new PrismaPg(pool); await pool.end();"
EXPOSE 3000
CMD ["node", "dist/index.mjs"]
