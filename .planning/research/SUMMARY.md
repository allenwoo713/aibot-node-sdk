# Project Research Summary

**Domain:** Node.js WeCom AI Bot SDK  
**Researched:** 2026-04-14  
**Confidence:** HIGH

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

## Top Table Stakes Features

1. **Non-blocking async persistence** — eliminate event-loop blocking in `ConversationStore`.
2. **Backward-compatible store API** — existing consumers and tests must not break.
3. **HTTP send fallback** — outbound messages via WeCom HTTP API when WebSocket is down.
4. **HTTP receive fallback** — expose a handler for WeCom callback push.
5. **Graceful transport switching** — `BotOrchestrator` should not know which transport is active.

## Architecture at a Glance

- **Async persistence**: Keep in-memory `Map` for hot reads; move all disk I/O to async with a single write queue.
- **Transport abstraction**: Introduce a `Transport` interface. `WSClient` and a new HTTP layer both implement it. A `TransportRouter` prefers WebSocket and falls back to HTTP transparently.
- **Inbound normalization**: WeCom HTTP callbacks are verified (SHA1), decrypted (AES-256-CBC), and converted into `WsFrame` objects so they flow through `MessageHandler` unchanged.

## Top 3 Pitfalls

1. **Concurrent async writes without serialization** — overlapping writes to a single JSON file will corrupt state. Must use a single write queue.
2. **Backward compatibility break** — naive async signature changes in `ConversationStore` break `BotOrchestrator` and external consumers. Refactor callers to `await` while preserving public API shape.
3. **Duplicate messages across transports** — dual-transport designs need `msgid` deduplication to prevent double AI replies and doubled costs.

## Suggested MVP Phase Order

1. **Async persistence refactor** — lowest risk, highest production impact.
2. **HTTP outbound fallback + access token management** — simpler than receive; reuses existing `axios` patterns.
3. **HTTP inbound webhook handler** — signature verification, decryption, and `WsFrame` normalization.
4. **Transport router & integration** — unify transports behind an interface, update `BotOrchestrator`, add E2E tests.

## Versions

All recommendations use the project's current dependency versions:
- `axios` ^1.6.7
- `eventemitter3` ^5.0.1
- Node.js 22 built-in `fs/promises`, `http`, `crypto`

## Sources

- Existing codebase (`src/memory.ts`, `src/api.ts`, `src/client.ts`, `src/ws.ts`)
- `.planning/PROJECT.md` milestone requirements
- `.planning/codebase/ARCHITECTURE.md` transport and persistence patterns
- Node.js official docs: `fs/promises`, `http`, `crypto`
- WeCom developer documentation conventions
