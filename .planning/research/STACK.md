# Technology Stack: Async Persistence & HTTP Fallback

**Domain:** Node.js WeCom AI Bot SDK
**Researched:** 2026-04-14

## Core Recommendations

### Async Persistence

| Choice | Rationale | Confidence |
|--------|-----------|------------|
| **Node.js `fs/promises`** | Native, zero-dependency replacement for `fs.*Sync`. Provides `readFile`, `writeFile`, `rename`, `access` with Promise API. | HIGH |
| **Atomic write via `writeFile` + `rename`** | Write to a temp file, then `fs.rename()` to target. Prevents partial/corrupt JSON on crash. | HIGH |
| **Single write queue (in-memory)** | Serialize concurrent `append` calls so only one disk write runs at a time. Simplest correctness guarantee. | HIGH |
| **Lazy/async initialization** | Move `fs.readFileSync` out of `ConversationStore` constructor into an explicit `load()` or first-access pattern. | HIGH |

**What NOT to use:**
- `fs-extra` or `graceful-fs` — adds dependency for capabilities already in Node.js core.
- SQLite / Redis for this milestone — overkill per `PROJECT.md` scope; JSON file is sufficient.
- `mmap` or low-level streams — unnecessary complexity for small-to-moderate conversation files.

### HTTP Fallback

| Choice | Rationale | Confidence |
|--------|-----------|------------|
| **`axios` (already in project)** | Existing HTTP client (`src/api.ts`). Reuse for WeCom HTTP API calls to minimize new dependencies. | HIGH |
| **WeCom HTTP Message API** | Official WeCom endpoints (`cgi-bin/message/send`, `cgi-bin/webhook/send`). Platform-native fallback path. | HIGH |
| **Access token caching + refresh** | WeCom HTTP API requires `access_token`. Cache it in-memory with lazy refresh on expiry or 42001 errors. | MEDIUM |
| **Raw Node.js `http` / framework-agnostic handler** | For inbound callbacks, expose a `handleCallback(req, res)` function so users can mount it in Express, Fastify, or raw `http.createServer`. | HIGH |

**What NOT to use:**
- `express` as a hard dependency — forces a framework choice on SDK consumers.
- Webhook tunnel services (ngrok/etc.) — irrelevant to SDK code; operational concern.
- Socket.io or SSE — not supported by WeCom callback model.

### Transport Unification

| Choice | Rationale | Confidence |
|--------|-----------|------------|
| **TypeScript interface `Transport`** | Abstract `send(frame)` and `on(event)` so `BotOrchestrator` stays transport-agnostic. | HIGH |
| **EventEmitter3 (already in project)** | Keep the existing typed event emitter pattern for both WS and HTTP inbound events. | HIGH |

## Versions

All recommendations use the project's current dependency versions:
- `axios` ^1.6.7
- `eventemitter3` ^5.0.1
- Node.js 22 built-in `fs/promises`

## Sources

- Existing codebase (`src/memory.ts`, `src/api.ts`, `src/client.ts`, `src/ws.ts`)
- Node.js official docs: `fs/promises` module
- WeCom developer documentation conventions
