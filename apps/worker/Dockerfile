FROM node:24-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV DATABASE_URL=postgresql://zarbit:zarbit@127.0.0.1:5432/zarbit?schema=public CI=true HUSKY=0
COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN cd apps/worker && pnpm run build

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
