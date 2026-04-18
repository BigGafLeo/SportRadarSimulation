# syntax=docker/dockerfile:1.6

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps with cache-friendly layer
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

# ---------- Stage 2: Production deps only ----------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 3: Runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
