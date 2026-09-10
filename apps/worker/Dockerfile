FROM --platform=$BUILDPLATFORM node:24-slim AS pruner
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune worker --docker

FROM --platform=$BUILDPLATFORM node:24-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10.26.0
ENV DATABASE_URL=postgresql://zarbit:zarbit@127.0.0.1:5432/zarbit?schema=public CI=true HUSKY=0

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @zarbit/db run db:generate
RUN pnpm --filter worker run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
RUN mkdir -p /sessions && chown node:node /sessions
USER node
WORKDIR /app/apps/worker
# Verify the installed native binding without connecting to Telegram.
RUN node --input-type=module -e "import { TelegramClient } from '@mtcute/node'; const client = new TelegramClient({ apiId: 1, apiHash: '0'.repeat(32), storage: ':memory:', logLevel: 0 }); await client.prepare(); await client.destroy();"
CMD ["node", "dist/index.mjs"]
