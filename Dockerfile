# Multi-stage Dockerfile for selfheal v1 + v2 (resilience + compliance).
#
# Stage 1: install workspace deps + build all packages + bundle the v1 server.
# Stage 2: copy only the bundled output + compiled package dist/ trees + a
#          minimal node_modules with production deps. ~75% smaller than copying
#          the full build env.

# ---------------------------------------------------------------------------
# Builder stage
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Enable corepack so pnpm is pinned to the version in packageManager.
RUN corepack enable

# Copy lockfile + workspace manifest first for better layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/core/package.json packages/core/
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Copy the rest of the source.
COPY . .

# Build packages first (topological order), then bundle the v1 server.
RUN pnpm -r --workspace-concurrency=1 build && pnpm build

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

# Copy lockfile + manifests for prod-only install.
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/packages/api/package.json packages/api/
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/sdk/package.json packages/sdk/
COPY --from=builder /app/packages/mcp-server/package.json packages/mcp-server/

# Production deps only — no devDependencies. tsup, vitest, drizzle-kit etc.
# are not needed at runtime.
RUN pnpm install --frozen-lockfile --prod

# Compiled artifacts.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/migrations ./packages/core/migrations
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/drizzle ./drizzle

# Drizzle migrations run via `npx drizzle-kit migrate` on start (per
# package.json scripts.start). Keep drizzle.config.ts available.
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000
CMD ["pnpm", "start"]
