FROM node:24-slim AS builder
RUN npm install -g pnpm@10.26.0
WORKDIR /app
ENV DATABASE_URL=file:./build.db
ENV CI=true

COPY . .
RUN --mount=type=cache,id=zarbit-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

ENV VITE_SERVER_URL="https://api-zarbit.gecutweb.ir/"
ENV NODE_ENV=production
RUN cd apps/web && pnpm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
