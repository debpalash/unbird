# syntax=docker/dockerfile:1

# ─── Build stage ──────────────────────────────────────────────
FROM --platform=linux/amd64 oven/bun:alpine AS builder

WORKDIR /app

# Install ALL dependencies (dev + prod needed for Vite build)
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy source and build frontend
COPY . .
RUN bun run build

# ─── Production stage (Alpine x64) ───────────────────────────
FROM --platform=linux/amd64 oven/bun:alpine AS runtime

WORKDIR /app

# Create non-root user
RUN adduser -D -h /app unbird \
    && chown -R unbird:unbird /app

# Copy built frontend assets
COPY --from=builder --chown=unbird:unbird /app/dist ./dist
COPY --from=builder --chown=unbird:unbird /app/public ./public
COPY --from=builder --chown=unbird:unbird /app/package.json ./

# Copy only server source (Bun runs TS natively)
COPY --from=builder --chown=unbird:unbird /app/src/server ./src/server
COPY --from=builder --chown=unbird:unbird /app/src/index.ts ./src/index.ts
COPY --from=builder --chown=unbird:unbird /app/tsconfig.json ./tsconfig.json

# Install production dependencies only
COPY --from=builder --chown=unbird:unbird /app/bun.lock ./
COPY --from=builder --chown=unbird:unbird /app/bunfig.toml ./
RUN bun install --frozen-lockfile --production && rm -rf /tmp/*

# Create directories for persistent data
RUN mkdir -p session cache && chown -R unbird:unbird session cache

# Switch to non-root user
USER unbird

# Default environment
ENV UNBIRD_PORT=3069 \
    UNBIRD_ADDRESS=0.0.0.0 \
    UNBIRD_TITLE=unbird \
    UNBIRD_HOSTNAME=localhost:3069 \
    NODE_ENV=production

EXPOSE 3069

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3069/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "start"]
