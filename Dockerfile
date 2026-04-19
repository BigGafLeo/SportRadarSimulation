# syntax=docker/dockerfile:1.6

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma schema must be present before `npm ci` (postinstall runs prisma generate)
# and before `npm run build` (TS references generated client types).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

# ---------- Stage 2: Production deps only ----------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, so schema must be present before npm ci
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 3: Runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV APP_MODE=orchestrator

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app --from=builder /app/dist ./dist
# prisma schema (for migrate deploy at startup) and generated client (from prod deps stage)
COPY --chown=app:app --from=deps /app/prisma ./prisma
COPY --chown=app:app --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=app:app package.json ./

USER app

EXPOSE 3000

# APP_MODE env selects which entrypoint to run:
# - orchestrator (default): dist/main.js — HTTP + WS + Bull Board
# - worker: dist/worker.main.js — BullMQ consumer only
CMD ["sh", "-c", "npx prisma migrate deploy && (if [ \"$APP_MODE\" = \"worker\" ]; then node dist/worker.main.js; else node dist/main.js; fi)"]
