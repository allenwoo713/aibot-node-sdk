<!-- generated-by: gsd-doc-writer -->

# Deployment

This document describes how to build and deploy the `@wecom/aibot-node-sdk` bot service.

## Deployment Targets

The project supports the following deployment targets:

| Target | Config File | Description |
|--------|-------------|-------------|
| Docker | `Dockerfile` | Multi-stage Docker build using Node.js 22 Alpine. The recommended production deployment method. |
| Node.js (bare metal / VM) | `package.json` | Run directly with `node` or `ts-node` after installing dependencies and building. |

No platform-specific configs (Vercel, Netlify, Fly.io, Railway, Serverless Framework) are present in this repository.

### Docker Deployment

The `Dockerfile` defines a two-stage build:

1. **Builder stage** (`node:22-alpine`) — installs build tools (`python3`, `make`, `g++`), installs dependencies with `pnpm`, and runs `pnpm run build` to produce `dist/` artifacts.
2. **Production stage** (`node:22-alpine`) — copies `dist/`, `node_modules/`, `package.json`, and `pnpm-lock.yaml` from the builder. Exposes port `3000` and runs `node dist/bot/entry.js`.

A volume is mounted at `/app/data` for persisting conversation state (default `PERSISTENCE_PATH=/app/data/.bot-state.json`).

### Bare Metal / VM Deployment

Requires Node.js 22 and `pnpm` (or `npm`/`yarn`) installed on the host.

1. Install dependencies: `pnpm install --frozen-lockfile`
2. Build: `pnpm run build`
3. Start: `node dist/bot/entry.js`

## Build Pipeline

The CI pipeline is defined in `.github/workflows/ci.yml`.

**Trigger:** push or pull request to `main`.

**Steps:**
1. Checkout source code.
2. Setup Node.js 22.
3. Install `pnpm` globally.
4. Install dependencies: `pnpm install --frozen-lockfile`.
5. Run tests: `pnpm test`.
6. Build artifacts: `pnpm run build`.

No automated deploy or release step is present in CI. Releases are performed manually via `npm run release` or `npm run release:dry`.

## Environment Setup

Before deploying, configure all required environment variables. See `docs/CONFIGURATION.md` for the full reference.

**Required variables (startup will fail if missing):**

| Variable | Description |
|----------|-------------|
| `BOT_ID` | WeCom bot ID from the admin console |
| `SECRET` | WeCom bot secret from the admin console |
| `ANTHROPIC_API_KEY` | Anthropic API key (or compatible provider key) |

**Important Docker-specific defaults:**

- `NODE_ENV=production`
- `PERSISTENCE_PATH=/app/data/.bot-state.json`

Mount a volume to `/app/data` to ensure conversation state survives container restarts.

Example `docker run`:

```bash
docker build -t aibot-node-sdk .
docker run -d \
  -p 3000:3000 \
  -v /host/data:/app/data \
  -e BOT_ID=your-bot-id \
  -e SECRET=your-bot-secret \
  -e ANTHROPIC_API_KEY=sk-ant-api03-... \
  aibot-node-sdk
```

<!-- VERIFY: Replace `/host/data` with your actual host persistence directory. -->

## Rollback Procedure

No automated rollback is configured in CI. If a deployment fails:

1. **Docker:** Redeploy the previous image tag or rebuild from the last known good commit.
2. **Bare metal / VM:** Stop the running process, checkout the previous commit, rebuild (`pnpm run build`), and restart (`node dist/bot/entry.js`).

## Monitoring

No dedicated monitoring libraries (Sentry, Datadog, New Relic, OpenTelemetry) are currently included in the project dependencies.

Observability is limited to:

- Console logs emitted by the bot service and transport layers.
- Optional custom `logger` injection via `BotConfig` (see `src/config/index.ts`).

<!-- VERIFY: If you add external monitoring, document the integration dashboard URL here. -->
