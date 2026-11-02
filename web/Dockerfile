# Build stage: Vite production bundle via pnpm.
FROM node:22-alpine AS builder
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Runtime stage: nginx serves the SPA and proxies /api + /ws to the api.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/dist /usr/share/nginx/html
EXPOSE 80
