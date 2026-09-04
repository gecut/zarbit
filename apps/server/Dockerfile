FROM node:24-slim AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
ENV DATABASE_URL=file:./build.db
ENV CI=true

COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
# MTProto session storage uses better-sqlite3. Fail the image build if its Linux native binding is absent.
RUN cd apps/server \
  && node --input-type=module -e "import path from 'node:path'; import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const mtcuteDir = path.dirname(require.resolve('@mtcute/node')); const Database = require(require.resolve('better-sqlite3', { paths: [mtcuteDir] })); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();"

ENV NODE_ENV=production
RUN cd apps/server && pnpm run build

FROM node:24-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
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

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["node", "dist/index.mjs"]
