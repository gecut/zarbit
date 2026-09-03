FROM node:24-slim AS builder
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
ENV DATABASE_URL=file:./build.db
ENV CI=true
COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN cd apps/worker && pnpm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/package.json ./package.json
CMD ["node", "dist/index.mjs"]
