# Phase 8: Docker Compose Deployment - Research

**Researched:** 2026-04-22
**Domain:** Docker Compose, Node.js HTTP health checks, container orchestration
**Confidence:** HIGH

## Summary

This phase adds a lightweight HTTP health check server to the existing WebSocket bot service and packages it for one-command local deployment via Docker Compose. The bot currently has no HTTP server — it is a pure WebSocket client. Research confirms that running the health endpoint in the **same Node.js process** as the bot is the standard and optimal approach for this workload: it avoids IPC complexity, shares memory state naturally, and keeps the container single-purpose.

The `HealthServer` should be a minimal `http.createServer()` instance (no Express/Fastify needed) listening on port 3000, with a single `/health` route. It must report **503** when `BotOrchestrator` has encountered a fatal error (auth exhausted or reconnect exhausted), and **200** otherwise. Temporary WebSocket disconnects must NOT mark the container unhealthy.

For Docker Compose, `compose.yml` (v2 default) with `build: .`, `env_file: [.env]`, explicit `environment` fail-fast validation, `unless-stopped` restart policy, and a `healthcheck` block with `start_period: 15s` is the documented best practice. The bind mount `./data:/app/data` correctly overlays the Dockerfile `VOLUME ["/app/data"]` without conflict.

**Primary recommendation:** Implement `HealthServer` in `src/health.ts` using Node.js built-in `http`, expose `isHealthy()` on `BotOrchestrator` (updated by transport `error` event listener), start/stop both in `entry.ts`, and configure Compose with `wget`-based health checks (Alpine-safe) and a 15-second start period.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Health check HTTP endpoint | API / Backend (bot process) | — | Runs inside the bot container; no separate service needed for a single route |
| Fatal error state tracking | API / Backend (BotOrchestrator) | — | Transport errors originate here; state must be queryable by HealthServer |
| Container orchestration config | CDN / Static (compose.yml) | — | Compose file is infrastructure-as-code, not runtime logic |
| Persistence survival | Database / Storage (bind mount) | — | Host filesystem owns durability across container restarts |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Add lightweight HTTP `/health` endpoint via separate `src/health.ts` module
- **D-02:** `/health` returns 200 when Node process running AND no fatal error; does NOT require active WebSocket
- **D-03:** `HealthServer` class in `src/health.ts`, not inline in `entry.ts`
- **D-04:** Health server listens on port 3000 (reuses Dockerfile `EXPOSE 3000`)
- **D-05:** Compose file named `compose.yml` (Docker Compose v2 default)
- **D-06:** Service builds from local Dockerfile with `build: .`
- **D-07:** Restart policy: `unless-stopped`
- **D-08:** Compose declares `env_file: [.env]` explicitly
- **D-09:** Required env vars (BOT_ID, SECRET, ANTHROPIC_API_KEY) listed with `:?` fail-fast validation
- **D-10:** Bind mount `./data:/app/data` for conversation persistence
- **D-11:** No named volume fallback — bind mount only

### Claude's Discretion
- Exact health check interval, timeout, and retry count values in `compose.yml`
- Whether to add a `/ready` readiness endpoint in addition to `/health`
- `HealthServer` internal error handling (port-in-use, unexpected paths)
- How `BotOrchestrator` exposes "fatal error" state to `HealthServer`
- Whether `HealthServer` should be started/stopped alongside `BotOrchestrator` lifecycle or managed independently in `entry.ts`

### Deferred Ideas (OUT OF SCOPE)
- Published image reference in compose (e.g., `image: ghcr.io/...`)
- Named volume option as an alternative to bind mount
- Multi-service compose (e.g., adding Redis, a separate DB)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCKER-01 | Developer can start the bot service with a single `docker compose up` command | `compose.yml` with `build: .` and `env_file` enables this [VERIFIED: Docker Compose docs] |
| DOCKER-02 | Compose configuration includes health check endpoint for container orchestration | `healthcheck` block in compose + `/health` HTTP route in bot process [VERIFIED: Docker Compose docs] |
| DOCKER-03 | Conversation persistence data survives container restarts via named volume | Bind mount `./data:/app/data` overlays Dockerfile `VOLUME` correctly [VERIFIED: Docker Compose docs] |
| DOCKER-04 | Environment variables are loaded from `.env` file for local development | `env_file: [.env]` + `environment` interpolation is the standard pattern [VERIFIED: Docker Compose docs] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `http` | built-in (v22) | Lightweight HTTP health server | Zero dependency, sufficient for a single route; no Express/Fastify needed |
| Docker Compose | v2.20+ (CLI v5.1.1 verified) | Local orchestration | `compose.yml` is the v2 default filename; v2.20+ supports `start_interval` |
| `wget` | Alpine built-in | Health check probe in container | Alpine images include `wget` by default; `curl` requires `apk add` [VERIFIED: Docker docs] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | ^17.4.2 (already in project) | Local env loading outside Docker | `npm start` / `ts-node` local dev |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js built-in `http` | Express / Fastify | Adds dependency overhead for one route; not justified |
| `wget` health check | `curl` | `curl` requires `apk add --no-cache curl` in Dockerfile; `wget` is free on Alpine |
| `http.createServer` | `node:http` module with `createServer` | Same thing; `node:http` is the modern import name |

**Version verification:**
- Node.js: v22.14.0 (verified via `node -v` on host, Dockerfile uses `node:22-alpine`)
- Docker: 29.4.0 (verified via `docker --version`)
- Docker Compose: v5.1.1 (verified via `docker compose version`)
- `ws`: 8.20.0 latest (verified via `npm view ws version`)

## Architecture Patterns

### System Architecture Diagram

```
Developer Host
|
|  docker compose up
|  (reads .env, builds image, starts container)
v
+------------------+
|   compose.yml    |
|  - build: .      |
|  - env_file      |
|  - healthcheck   |
|  - volumes       |
+--------+---------+
         |
         v
+-----------------------------+
|  aibot-node-sdk container   |
|  (node:22-alpine)           |
|                             |
|  +-----------------------+  |
|  |  BotOrchestrator      |  |
|  |  - transport (WS)     |  |
|  |  - ConversationStore  |  |
|  |  - AnthropicApiAdapter|  |
|  |  - _fatalError flag   |  |
|  +----------+------------+  |
|             |               |
|  transport 'error' event    |
|  (WSAuthFailureError /      |
|   WSReconnectExhaustedError)|
|             |               |
|             v               |
|  +-----------------------+  |
|  |  HealthServer         |  |
|  |  - http.createServer  |  |
|  |  - listens on :3000   |  |
|  |  - /health -> 200/503 |  |
|  +----------+------------+  |
|             |               |
|             v               |
|    Docker HEALTHCHECK       |
|    (wget /health)           |
|             |               |
+-------------|---------------+
              |
              v
+----------------------------+
|  Host filesystem           |
|  ./data/ -> /app/data      |
|  (SQLite/JSON persistence) |
+----------------------------+
```

### Recommended Project Structure

```
src/
├── health.ts           # NEW: HealthServer class
├── bot/
│   ├── entry.ts        # MODIFIED: start/stop HealthServer alongside BotOrchestrator
│   └── index.ts        # MODIFIED: expose isHealthy() / fatal error state
├── ...
compose.yml             # NEW: Docker Compose v2 configuration
```

### Pattern 1: Co-Located Health Server in Same Process
**What:** The HTTP health server runs in the same Node.js process as the bot, sharing memory and event emitters.
**When to use:** Single-purpose containers where the health check needs application-state awareness (not just process liveness).
**Example:**
```typescript
// Source: Node.js official docs (Context7 /nodejs/node)
import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const healthy = bot.isHealthy(); // shared memory access
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: healthy ? 'healthy' : 'unhealthy' }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(3000);
```

### Pattern 2: Fatal Error State Exposure via Method
**What:** `BotOrchestrator` maintains a private `_fatalError` boolean set by transport `error` event listener, exposed via `isHealthy(): boolean`.
**When to use:** When health logic must distinguish between transient failures (reconnecting) and terminal failures (auth exhausted).
**Example:**
```typescript
// Source: project codebase patterns (eventemitter3)
export class BotOrchestrator {
  private _fatalError = false;

  constructor(...) {
    this.transport.on('error', (err) => {
      if (err instanceof WSAuthFailureError || err instanceof WSReconnectExhaustedError) {
        this._fatalError = true;
      }
    });
  }

  isHealthy(): boolean {
    return !this._fatalError;
  }
}
```

### Pattern 3: Graceful Shutdown with Parallel Stop
**What:** On SIGINT/SIGTERM, stop both the bot and health server concurrently, then exit.
**When to use:** When multiple subsystems need cleanup before process exit.
**Example:**
```typescript
// Source: project codebase (src/bot/entry.ts)
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`);
  await Promise.all([
    bot.stop(),
    healthServer.stop(),
  ]);
  process.exit(0);
}
```

### Anti-Patterns to Avoid
- **Separate health check process:** Running a second Node.js process just for `/health` adds IPC complexity and doubles memory footprint for no benefit.
- **Health check requires WebSocket connection:** Temporary network blips would cause unnecessary container restarts; the requirement explicitly rejects this.
- **Custom shell script health check:** A Node.js-based `wget` or `curl` command is simpler and avoids maintaining a separate script file.
- **Named volume + bind mount hybrid:** The user chose bind mount only; mixing them adds confusion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP health server framework | Express / Fastify | `node:http` built-in | One route does not justify 50+ transitive dependencies |
| Environment variable loading in dev | Custom parser | `dotenv` (already in project) | Battle-tested, handles edge cases like multiline values |
| Process health check | Custom shell script | `wget` in Alpine | Alpine includes `wget` by default; exit codes work with Docker health checks |
| Container restart logic | Custom supervisor | Docker Compose `restart: unless-stopped` | Native, well-tested, integrates with `docker compose up --wait` |

**Key insight:** The health check domain is deceptively simple — a single `/health` route — but using a full framework introduces dependency bloat and attack surface. Node.js built-in `http` is sufficient and is the pattern used by the Node.js documentation itself.

## Runtime State Inventory

> This phase involves adding new files and modifying existing ones, but does not rename or rebrand. Runtime state inventory is minimal.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | SQLite DB at `./data/.bot-state.db` (if using sqlite backend) or JSON at `./data/.bot-state.json` | Ensure bind mount `./data:/app/data` persists these across restarts |
| Live service config | None — no external services configured outside git | None |
| OS-registered state | None | None |
| Secrets/env vars | `.env` file (gitignored) contains BOT_ID, SECRET, ANTHROPIC_API_KEY | `env_file: [.env]` in compose loads it at runtime; no migration needed |
| Build artifacts | `dist/` directory rebuilt on `docker compose up --build` | Standard Docker build process; no special action |

**Nothing found in category:** Stored data — verified by reading `src/memory.ts` and `src/config/index.ts`; persistence path defaults to `./.bot-state.json` but Dockerfile sets `PERSISTENCE_PATH=/app/data/.bot-state.json`.

## Common Pitfalls

### Pitfall 1: Alpine Missing `curl`
**What goes wrong:** Health check command uses `curl`, but `node:22-alpine` does not include it by default. Container starts but health checks fail permanently.
**Why it happens:** Developers often assume `curl` is universally available like on Debian/Ubuntu images.
**How to avoid:** Use `wget` (included in Alpine) or install `curl` via `RUN apk add --no-cache curl` in the Dockerfile. `wget` is preferred to keep the image minimal.
**Warning signs:** `docker inspect <container>` shows `"Status": "unhealthy"` with exit code 127 (command not found).

### Pitfall 2: `start_period` Too Short
**What goes wrong:** Docker Compose marks the container unhealthy during the bot's initial WebSocket connection and authentication, causing unnecessary restarts.
**Why it happens:** The bot needs a few seconds to connect and auth; without `start_period`, failed health checks during startup count toward the retry limit.
**How to avoid:** Set `start_period: 15s` (or longer) in the `healthcheck` block. During this period, failed checks do not count toward `retries`.
**Warning signs:** Container enters `unhealthy` state within 30 seconds of starting, then gets restarted by Compose.

### Pitfall 3: Bind Mount Directory Permissions
**What goes wrong:** The container runs as `root` (default in node:22-alpine), but on Linux hosts the bind mount `./data` may be created with restrictive permissions, causing SQLite write failures.
**Why it happens:** Docker creates the host directory with root ownership if it does not exist; on Linux this can cause permission mismatches if the developer later tries to inspect files as a non-root user.
**How to avoid:** Document that `./data` is created automatically. The container runs as root by default, so writes succeed. If the user changes `USER` in Dockerfile later, they must ensure UID/GID alignment.
**Warning signs:** `EACCES: permission denied` errors in bot logs when writing to `/app/data`.

### Pitfall 4: `env_file` vs `environment` Precedence Confusion
**What goes wrong:** Developer sets a value in `.env` but also has it in their shell environment; the shell value wins unexpectedly.
**Why it happens:** Docker Compose variable interpolation pulls from shell first, then `.env`. If `environment: BOT_ID=${BOT_ID}` is used, the shell value takes precedence over the `.env` file.
**How to avoid:** Use `env_file: [.env]` for clean loading, and use `environment` only for `:?` fail-fast validation (which still interpolates from the env file). Document that `.env` is the single source of truth for local development.
**Warning signs:** Bot connects to the wrong WeCom bot despite `.env` appearing correct.

### Pitfall 5: `VOLUME` + Bind Mount Interaction
**What goes wrong:** Concern that Dockerfile `VOLUME ["/app/data"]` conflicts with compose bind mount `./data:/app/data`.
**Why it happens:** Both declare intent for `/app/data`, leading to uncertainty about which takes precedence.
**How to avoid:** They do not conflict. The compose bind mount overlays the Dockerfile volume at runtime. The Dockerfile `VOLUME` serves as documentation and enables anonymous volumes if no mount is specified; compose bind mount overrides it completely.
**Warning signs:** None — this is a design concern, not a runtime error.

## Code Examples

### Verified patterns from official sources:

#### Minimal Health Server
```typescript
// Source: Node.js official docs (Context7 /nodejs/node)
import http from 'node:http';

export class HealthServer {
  private server: http.Server | null = null;

  constructor(private isHealthy: () => boolean) {}

  start(port = 3000): void {
    this.server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        const ok = this.isHealthy();
        res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: ok ? 'healthy' : 'unhealthy' }));
        return;
      }
      res.writeHead(404).end();
    });
    this.server.listen(port, () => {
      console.log(`Health server listening on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
    });
  }
}
```

#### Compose Configuration
```yaml
# Source: Docker Compose docs (Context7 /docker/compose)
services:
  bot:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - BOT_ID=${BOT_ID:?BOT_ID is required}
      - SECRET=${SECRET:?SECRET is required}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

#### Dockerfile HEALTHCHECK (optional but recommended)
```dockerfile
# Source: Docker docs (Context7 /docker/docs)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
```

#### BotOrchestrator Fatal Error Tracking
```typescript
// Source: project codebase patterns (src/bot/index.ts, src/ws.ts)
export class BotOrchestrator {
  private _fatalError = false;

  private setupEventHandlers(): void {
    this.transport.on('error', (err) => {
      if (err instanceof WSAuthFailureError || err instanceof WSReconnectExhaustedError) {
        this._fatalError = true;
      }
      console.error('Transport error:', err.message);
    });
  }

  isHealthy(): boolean {
    return !this._fatalError;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `docker-compose.yml` | `compose.yml` | Docker Compose v2 (2022+) | v2 CLI uses `compose.yml` by default; old filename still works but is legacy |
| `curl` in health checks | `wget` in Alpine images | Ongoing | Alpine minimal images exclude `curl` to reduce size; `wget` is included |
| Separate health check container | In-process health endpoint | Modern container best practices | Sidecar pattern is overkill for simple liveness; same process reduces complexity |
| Named volumes for local dev | Bind mounts for local dev | Docker Compose community standard | Bind mounts allow easy host inspection and backup; named volumes are better for production swarms |

**Deprecated/outdated:**
- `docker-compose` (Python CLI): Replaced by `docker compose` (Go-based plugin) in Docker Desktop and modern Docker Engine.
- `HEALTHCHECK` with `curl` in Alpine without installing it first: Causes silent unhealthy containers.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `node:22-alpine` includes `wget` by default | Common Pitfalls | Health checks would fail with command not found; fix is `apk add curl` or `wget` verification |
| A2 | `BotOrchestrator` transport `error` events include `WSAuthFailureError` and `WSReconnectExhaustedError` | Architecture Patterns | If errors are not emitted, fatal state tracking would not work; verified by reading `src/ws.ts` and `src/client.ts` |
| A3 | Docker Compose v5.1.1 supports all documented `healthcheck` parameters including `start_period` | Standard Stack | `start_period` has been supported since Compose v2.1+; v5.1.1 is well beyond this |
| A4 | The `./data` directory on the host will have adequate permissions for the container's root user to write | Runtime State Inventory | On rootless Docker or custom `USER` directives, this may fail; current Dockerfile does not set `USER` |

## Open Questions

1. **Should we add a `/ready` readiness endpoint?**
   - What we know: The user deferred this to Claude's discretion. Readiness typically means "ready to serve traffic," which for this bot means WebSocket is connected and auth succeeded.
   - What's unclear: Whether any orchestrator (local Compose only) actually needs readiness vs. liveness.
   - Recommendation: **Skip `/ready` for this phase.** The requirement (DOCKER-02) asks for a health check endpoint, not readiness. A single `/health` endpoint returning 200 for liveness and 503 for fatal errors satisfies the need. Add `/ready` later if Kubernetes or swarm deployment is introduced.

2. **Should the Dockerfile include a `HEALTHCHECK` instruction in addition to the Compose `healthcheck` block?**
   - What we know: Dockerfile `HEALTHCHECK` is image-level; Compose `healthcheck` is runtime-level and overrides it.
   - What's unclear: Whether the image should be self-describing for health even outside Compose.
   - Recommendation: **Add Dockerfile `HEALTHCHECK` as documentation.** It provides value when running `docker run` directly, and Compose overrides it cleanly. No downside.

3. **What exact `start_period` duration is appropriate?**
   - What we know: The bot needs time to start, load config, connect WebSocket, and authenticate. Default `maxAuthFailureAttempts=5` with exponential backoff means worst-case startup could take several seconds.
   - What's unclear: Exact WeCom auth latency in the user's environment.
   - Recommendation: **Use `start_period: 15s`.** This is conservative enough for slow networks but not so long that an actually broken container hangs unnoticed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + runtime | Yes | v22.14.0 | — |
| npm | Package management | Yes | 11.5.2 | pnpm (also installed) |
| Docker | Containerization | Yes | 29.4.0 | — |
| Docker Compose | Orchestration | Yes | v5.1.1 | — |
| `wget` in `node:22-alpine` | Health check probe | Yes (in image) | — | Install `curl` via `apk` |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- None

## Validation Architecture

> Nyquist validation is explicitly disabled (`workflow.nyquist_validation: false`) in `.planning/config.json`. This section is included for completeness but is not required for phase gating.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 |
| Config file | none — default vitest config |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCKER-01 | `docker compose up` starts the bot | smoke / manual | `docker compose up --build -d` | ❌ Wave 0 |
| DOCKER-02 | Health check returns 200/503 appropriately | unit | `npm test` (test `HealthServer` + mocked `isHealthy`) | ❌ Wave 0 |
| DOCKER-03 | Persistence file survives container restart | integration | manual — requires container lifecycle | ❌ Wave 0 |
| DOCKER-04 | `.env` variables loaded into container | smoke / manual | `docker compose config` to verify interpolation | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/health.ts` — does not exist
- [ ] `src/health.test.ts` — unit tests for `HealthServer`
- [ ] `compose.yml` — does not exist
- [ ] `Dockerfile` — needs `HEALTHCHECK` instruction and `wget` verification
- [ ] `.gitignore` — should ignore `./data/` directory

## Security Domain

> This phase introduces an HTTP server listening on a network port. While it is a simple health endpoint, it expands the attack surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Health endpoint is unauthenticated by design (liveness probe) |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No sensitive data exposed |
| V5 Input Validation | Yes | Reject non-GET methods and non-/health paths; return 404 |
| V6 Cryptography | No | No crypto operations in health endpoint |
| V9 Communication | Yes | Bind to `0.0.0.0` inside container (Docker default), but port 3000 is the only exposed port |

### Known Threat Patterns for Node.js HTTP Servers

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unhandled routes leaking info | Information Disclosure | Return 404 for all non-/health requests; no stack traces |
| Slowloris / connection exhaustion | Denial of Service | `http.createServer` has default timeouts; keep `requestTimeout` default |
| Health endpoint used for reconnaissance | Information Disclosure | Do not expose version numbers, config, or internal state beyond boolean healthy/unhealthy |

## Sources

### Primary (HIGH confidence)
- Context7 `/docker/compose` — healthcheck block syntax, `start_period`, `start_interval`
- Context7 `/docker/docs` — Dockerfile `HEALTHCHECK` instruction options, defaults, CMD forms
- Context7 `/nodejs/node` — `http.createServer()`, request listener patterns, JSON response examples
- Docker Compose official docs (WebFetch) — `env_file` syntax, precedence rules, `restart` values
- Docker Compose official docs (WebFetch) — volume mount behavior, bind mount vs named volume

### Secondary (MEDIUM confidence)
- Dockerfile in project root — multi-stage build, `EXPOSE 3000`, `VOLUME ["/app/data"]`
- `src/bot/entry.ts` — existing lifecycle patterns, graceful shutdown
- `src/bot/index.ts` — `BotOrchestrator` structure, event handler patterns
- `src/ws.ts` — `WSAuthFailureError`, `WSReconnectExhaustedError`, retry logic

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against Docker Compose docs, Node.js docs, and local environment
- Architecture: HIGH — patterns derived from existing codebase (eventemitter3, transport layers) and official docs
- Pitfalls: HIGH — Alpine `wget` vs `curl` is a well-known Docker community pattern; verified via Docker docs

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (Docker Compose and Node.js are stable; low churn expected)
