FROM --platform=$BUILDPLATFORM node:24-slim AS pruner
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune web --docker

FROM --platform=$BUILDPLATFORM node:24-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@10.26.0
ENV CI=true HUSKY=0

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

COPY --from=pruner /app/out/full/ .
ARG VITE_SERVER_URL
RUN test -n "$VITE_SERVER_URL"
ENV VITE_SERVER_URL=$VITE_SERVER_URL NODE_ENV=production
RUN pnpm --filter web run build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
