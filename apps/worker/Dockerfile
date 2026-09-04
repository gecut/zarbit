FROM node:24-slim AS builder
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
ENV DATABASE_URL=file:./build.db
ENV CI=true
COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
# MTProto session storage uses better-sqlite3. Fail the image build if its Linux native binding is absent.
RUN cd apps/worker \
  && node --input-type=module -e "import path from 'node:path'; import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const mtcuteDir = path.dirname(require.resolve('@mtcute/node')); const Database = require(require.resolve('better-sqlite3', { paths: [mtcuteDir] })); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();"
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
