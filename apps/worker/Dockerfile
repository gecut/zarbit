FROM node:24-slim AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
ENV DATABASE_URL=file:./build.db
ENV CI=true
COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
# MTProto session storage uses better-sqlite3. Fail the image build if its Linux native binding is absent.
RUN cd apps/worker \
  && node --input-type=module -e "import { SqliteStorageDriver } from '@mtcute/node'; const db = new SqliteStorageDriver(':memory:')._createDatabase(); db.prepare('SELECT 1').get(); db.close();"
RUN cd apps/worker && pnpm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
WORKDIR /app/apps/worker
CMD ["node", "dist/index.mjs"]
