# Phase 8: Docker Compose Deployment - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can deploy the bot service locally with a single command, health monitoring, and persistent conversation data. This phase delivers:

1. `compose.yml` for one-command local deployment (`docker compose up`)
2. Container health check endpoint that reports healthy when the bot is running without fatal errors
3. Persistent conversation data that survives `docker compose down` + `docker compose up`
4. Environment variables loaded from `.env` without manual `export`

The bot currently has no HTTP server for health checks — it is a WebSocket client. The existing `HttpTransport` is for receiving WeCom callbacks, not general-purpose HTTP serving.

</domain>

<decisions>
## Implementation Decisions

### Health Check
- **D-01:** Add a lightweight HTTP `/health` endpoint to the bot. Rejects process-only checks and custom state-aware scripts.
- **D-02:** `/health` returns HTTP 200 when the Node process is running **AND** no fatal error has occurred (e.g., auth failure, exhausted reconnects). It does **not** require an active WebSocket connection — temporary disconnects should not mark the container unhealthy.
- **D-03:** Health endpoint implemented as a separate `src/health.ts` module exporting a `HealthServer` class. **Not** inline in `entry.ts` — separation enables independent testing.
- **D-04:** Health server listens on **port 3000**, reusing the existing `EXPOSE 3000` in the Dockerfile.

### Compose File Structure
- **D-05:** Compose file named **`compose.yml`** (Docker Compose v2 default), not `docker-compose.yml`.
- **D-06:** Service builds from local Dockerfile with **`build: .`**. A published image reference is out of scope for this phase.
- **D-07:** Service restart policy is **`unless-stopped`** — restarts on failure and host reboot, but stays stopped if manually stopped.

### Environment & Secrets
- **D-08:** Compose service declares **`env_file: [.env]`** explicitly for clarity and portability. Does not rely on Docker Compose's implicit `.env` auto-loading alone.
- **D-09:** Required environment variables (**`BOT_ID`**, **`SECRET`**, **`ANTHROPIC_API_KEY`**) are listed in the compose `environment` section with **`:?`** fail-fast validation (e.g., `BOT_ID=${BOT_ID:?BOT_ID is required}`). This produces a clear error at container startup if any required var is missing.

### Volume & Persistence
- **D-10:** Compose uses a **bind mount** `./data:/app/data` for conversation persistence. This stores SQLite/JSON data in a local `./data` directory for easy inspection and backup.
- **D-11:** **No named volume fallback** — bind mount only. One way to do it, no commented alternatives in the compose file.

### Claude's Discretion
- Exact health check interval, timeout, and retry count values in `compose.yml` `healthcheck` block
- Whether to add a `/ready` readiness endpoint in addition to `/health`
- `HealthServer` internal error handling (e.g., port-in-use, unexpected request paths)
- How `BotOrchestrator` exposes "fatal error" state to `HealthServer` (event emitter? property? method?)
- Whether `HealthServer` should be started/stopped alongside `BotOrchestrator` lifecycle or managed independently in `entry.ts`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 8 goal, success criteria, and requirement mapping (DOCKER-01 to DOCKER-04)
- `.planning/REQUIREMENTS.md` — DOCKER-01 through DOCKER-04 acceptance criteria
- `.planning/PROJECT.md` — v1.2 milestone context and target features

### Existing Code
- `Dockerfile` — Current multi-stage build with `EXPOSE 3000`, `VOLUME ["/app/data"]`, `PERSISTENCE_PATH=/app/data/.bot-state.json`
- `src/bot/entry.ts` — Bot startup, graceful shutdown on SIGINT/SIGTERM, instantiates `BotOrchestrator`
- `src/bot/index.ts` — `BotOrchestrator` with `start()`, `stop()`, transport, and store references
- `src/config/index.ts` — `BotConfig` interface, `loadConfig()`, environment variable loading
- `.env.example` — Complete environment variable documentation

### Prior Phase Decisions
- `.planning/phases/05-persistent-conversation-storage/05-CONTEXT.md` — SQLite backend, WAL mode, persistence path conventions, `better-sqlite3` native addon
- `.planning/phases/06-integration-deployment/06-CONTEXT.md` — Dockerfile multi-stage build, `node_modules` copied from builder stage
- `.planning/phases/07-wecom-api-client-foundation/07-CONTEXT.md` — Token file caching near persistence path, async I/O patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BotOrchestrator` already has `start()` / `stop()` lifecycle and holds references to transport and store
- `Dockerfile` already exposes port 3000 and declares `/app/data` as a volume
- `loadConfig()` already validates required environment variables

### Established Patterns
- Graceful shutdown: `entry.ts` listens for SIGINT/SIGTERM and calls `await bot.stop()` before exit
- Environment-based configuration: all tunables loaded from `process.env` via `getEnv()` / `getEnvInt()`
- Best-effort error suppression: warnings logged, process continues where possible

### Integration Points
- `entry.ts` is the natural place to instantiate and start `HealthServer` alongside `BotOrchestrator`
- `HealthServer` needs access to bot state (running / fatal error) — could listen on `BotOrchestrator` events or poll a property
- `Dockerfile` `HEALTHCHECK` instruction will reference the `/health` endpoint
- `compose.yml` `healthcheck` block will reference the same endpoint

</code_context>

<specifics>
## Specific Ideas

- `HealthServer` should be minimal: `http.createServer()` with a single `/health` route, returns `200 OK` or `503 Service Unavailable`
- The bot's fatal error state could be tracked by `BotOrchestrator` (e.g., `this._fatalError = true` after unrecoverable transport failure) and exposed via a `isHealthy()` method
- `./data` directory should be `.gitignore`d to prevent accidental commit of local conversation state
- `compose.yml` should include a `healthcheck` block with `test: ["CMD", "curl", "-f", "http://localhost:3000/health"]` (or `wget` if curl is not in the alpine image)

</specifics>

<deferred>
## Deferred Ideas

- Published image reference in compose (e.g., `image: ghcr.io/...`) — requires CI/CD pipeline, deferred to future milestone
- Named volume option as an alternative to bind mount — user chose bind mount only
- Multi-service compose (e.g., adding Redis, a separate DB) — bot is standalone with embedded SQLite

</deferred>

---

*Phase: 08-docker-compose-deployment*
*Context gathered: 2026-04-22*
