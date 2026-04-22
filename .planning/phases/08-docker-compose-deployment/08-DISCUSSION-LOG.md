# Phase 8: Docker Compose Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 8-docker-compose-deployment
**Areas discussed:** Health check mechanism, Compose file structure, Environment & secrets strategy, Volume & persistence paths

---

## Health check mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Add a lightweight HTTP /health endpoint | Start a minimal HTTP server that returns 200 when the bot is healthy. Most standard for container orchestration. | ✓ |
| Process-based check (no code changes) | Use Docker HEALTHCHECK with `pgrep node` to verify the Node process is alive. Simplest but only checks process existence. | |
| Custom state-aware script | Write a script that checks the bot's internal state (e.g., WebSocket connected). Most accurate but more complex. | |

**User's choice:** Add a lightweight HTTP /health endpoint
**Notes:** Bot is a WebSocket client, not a server. No existing HTTP endpoint to probe.

### Follow-up: What should /health verify?

| Option | Description | Selected |
|--------|-------------|----------|
| Process alive only | Return 200 if the Node process is running. Simplest, fastest. | |
| Process + WebSocket connected | Return 200 only if bot process running AND WebSocket transport is currently connected. More accurate but could mark unhealthy during temporary reconnects. | |
| Process + no fatal errors | Return 200 if process running AND no unrecoverable error has occurred. Balances accuracy and stability. | ✓ |

**User's choice:** Process + no fatal errors

### Follow-up: Where should the health endpoint live?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in entry.ts | Start `http.createServer` alongside `bot.start()` on port 3000. Simplest integration. | |
| Separate health module | `src/health.ts` with its own `HealthServer` class. Cleaner separation, easier to test independently. | ✓ |

**User's choice:** Separate health module — `src/health.ts` with its own `HealthServer` class on port 3000
**Notes:** Port 3000 reuses the existing Dockerfile `EXPOSE 3000`.

---

## Compose file structure

### How should the compose file reference the image?

| Option | Description | Selected |
|--------|-------------|----------|
| Build from Dockerfile locally | `build: .` — best for local development and iterating on code. | ✓ |
| Reference a published image | Pre-built image from registry. Requires publishing pipeline. | |
| Both | Build with an image override option. Most flexible but more complex. | |

**User's choice:** Build from Dockerfile locally (`build: .`)

### What restart policy?

| Option | Description | Selected |
|--------|-------------|----------|
| unless-stopped | Restarts on failure or reboot, stays stopped if manually stopped. | ✓ |
| always | Restarts no matter what, even if manually stopped. | |
| on-failure | Only restarts on non-zero exit. Doesn't restart after host reboot. | |

**User's choice:** unless-stopped

### Compose file name?

| Option | Description | Selected |
|--------|-------------|----------|
| compose.yml | Modern Docker Compose v2 default, shorter. | ✓ |
| docker-compose.yml | Traditional, more discoverable. | |

**User's choice:** compose.yml

---

## Environment & secrets strategy

### How should environment variables be passed?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-load .env (implicit) | Docker Compose reads `.env` automatically, no compose-level config needed. | |
| Explicit env_file declaration | Declare `env_file: [.env]` in compose for clarity and portability. | ✓ |
| Pass required vars only in compose | Explicitly list required vars, let `.env` handle the rest. | |

**User's choice:** Explicit env_file declaration

### Should required vars be listed in compose?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes | List required vars in compose `environment` section with `:?` fail-fast validation. | ✓ |
| No | Let the bot handle missing vars at runtime. | |

**User's choice:** Yes — list required vars in compose environment section

---

## Volume & persistence paths

### How should the data volume be configured?

| Option | Description | Selected |
|--------|-------------|----------|
| Named volume only | `bot-data:/app/data` — survives `docker compose down`, Docker-managed storage. | |
| Bind mount | `./data:/app/data` — local directory, easier to inspect and backup. | ✓ |
| Named volume with optional bind-mount override | Default named volume, users can override via env var. | |

**User's choice:** Bind mount — `./data:/app/data`

### Should we also provide a named volume option?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep bind-mount only | Simpler, one way to do it. | ✓ |
| Provide both options | Default bind mount, commented named volume for users who prefer Docker-managed storage. | |

**User's choice:** Keep bind-mount only — simpler, one way to do it

---

## Claude's Discretion

- Exact health check interval, timeout, and retry count values
- Whether to add a `/ready` readiness endpoint in addition to `/health`
- `HealthServer` internal error handling details
- How `BotOrchestrator` exposes "fatal error" state to `HealthServer`
- `HealthServer` lifecycle management relative to `BotOrchestrator`

---

*Phase: 08-docker-compose-deployment*
*Discussion completed: 2026-04-22*
