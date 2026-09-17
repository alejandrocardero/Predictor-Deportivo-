# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build frontend (Vite) + bundle server (esbuild)
RUN npm run build

# Prune devDependencies
RUN npm prune --production

# ── Stage 2: Runtime ───────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy only what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Environment variables MUST be provided at runtime via:
#   docker run -e GEMINI_API_KEY=xxx -e THE_ODDS_API_KEY=xxx ...
# NEVER bake secrets into the image.
#
# Required (optional but features degrade without them):
#   GEMINI_API_KEY, THE_ODDS_API_KEY, API_FOOTBALL_KEY, HF_API_KEY
# Optional:
#   PORT=3000, HOST=0.0.0.0, NODE_ENV=production

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/predict || exit 1

USER appuser

CMD ["node", "dist/server.cjs"]
