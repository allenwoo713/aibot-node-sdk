# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools for native addons (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN npm install -g pnpm

# Use hoisted linker to avoid ESM resolution issues in Docker
RUN pnpm config set node-linker hoisted

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PERSISTENCE_PATH=/app/data/.bot-state.json

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "dist/bot/entry.js"]
