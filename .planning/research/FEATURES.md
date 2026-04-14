# Feature Landscape: Async Persistence & HTTP Fallback

**Domain:** WeCom AI Bot SDK (Node.js)
**Researched:** 2026-04-14

## Table Stakes

Features users expect from a messaging SDK with persistence and fallback transports. Missing these makes the SDK feel unreliable or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Non-blocking async persistence** | Synchronous file I/O blocks the Node.js event loop, causing latency spikes and dropped heartbeats under load | Low | Replace `fs.*Sync` with `fs/promises` equivalents in `ConversationStore`. Keep JSON format for backward compatibility. |
| **Backward-compatible store API** | Existing consumers (`BotOrchestrator`, tests, direct users) depend on current `ConversationStore` method signatures | Low | Methods stay sync-returning for reads; only I/O becomes async internally. Or return Promises where callers can `await`. |
| **HTTP fallback for message receive** | When WebSocket is unavailable (firewall, outage, rate-limit), messages must still arrive via WeCom's official push/callback HTTP API | Medium | WeCom provides `aibot_msg_callback` and `aibot_event_callback` over HTTP. SDK needs to expose an HTTP handler/endpoint. |
| **HTTP fallback for message send** | Outbound replies and proactive messages must work when WebSocket is down | Medium | WeCom's HTTP API supports sending messages via POST to `https://qyapi.weixin.qq.com/cgi-bin/...`. Requires access token management. |
| **Graceful transport switching** | Primary WebSocket + fallback HTTP should be transparent to bot logic | Medium | `WSClient` (or a new transport abstraction) should route sends to the best available transport and surface receives uniformly. |
| **Corrupt-state recovery** | If the persistence file is malformed, the SDK must not crash | Low | Already partially implemented (`ConversationStore.load` catches and ignores). Keep this behavior with async I/O. |
| **TTL + LRU eviction** | Conversations must not grow unbounded in memory or on disk | Low | Already exists. Ensure async save still respects eviction boundaries. |

## Differentiators

Features that set a mature messaging SDK apart. Not strictly required, but valued by production operators.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Debounced/batched persistence writes** | Reduces disk I/O under high-frequency chat by coalescing rapid `append` calls | Medium | E.g., flush to disk every N ms or every M writes. Must still guarantee durability on graceful shutdown. |
| **Pluggable persistence backend** | Allow users to swap JSON file store for Redis, SQLite, or a remote DB without changing bot logic | Medium | Extract a `ConversationStore` interface; provide `JsonFileStore` as default. |
| **Automatic transport health detection** | Proactively detect WebSocket degradation and preemptively switch to HTTP before total failure | Medium | Heartbeat miss threshold could trigger a "degraded" state where sends are duplicated or fallback-activated. |
| **Message retry & deduplication on fallback** | HTTP paths can fail or duplicate; the SDK should retry idempotently and dedupe by `msgid` | Medium | WeCom provides `msgid` in callbacks. Store recently seen IDs to suppress duplicates. |
| **Streaming reply compatibility over HTTP** | If WebSocket drops mid-stream, the SDK could finish the stream over HTTP or at least emit a graceful truncation | High | WeCom HTTP API does not support true streaming in the same way WebSocket does. May require "finish=true" semantics only. |
| **Metrics/hooks for transport switches** | Operators need visibility into how often fallback is used | Low | Emit events (`transport:switched`, `persistence:flushed`) or accept a metrics callback. |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Distributed consensus / multi-node sync** | Far beyond scope of a Node.js SDK; requires infrastructure like Redis or etcd | Keep single-process focus. If multi-node is needed later, introduce a `ConversationStore` interface and external provider. |
| **Full ORM / SQL schema migrations** | Overkill for conversation history (simple JSON array of messages) | Stick to schema-less JSON or a minimal key-value abstraction. |
| **HTTP fallback for media upload** | WeCom media upload over HTTP is a separate, complex API (multipart/form-data, chunking). The milestone explicitly scopes WebSocket as primary for uploads. | Document that media upload requires WebSocket. If needed later, build a dedicated `MediaHttpClient`. |
| **Bi-directional real-time sync over HTTP** | HTTP is request/response; do not try to simulate WebSocket push with long-polling | Use WeCom's official callback push model (they POST to your server). |
| **Encryption-at-rest for persistence file** | Adds operational complexity (key management) with minimal security benefit for local JSON files | Rely on OS-level filesystem permissions. If needed, users can encrypt the `persistencePath` volume. |

## Feature Dependencies

```
Non-blocking async persistence
  -> Backward-compatible store API
  -> Corrupt-state recovery
  -> TTL + LRU eviction

HTTP fallback for message receive
  -> HTTP fallback for message send
  -> Graceful transport switching

Graceful transport switching
  -> HTTP fallback for message send
  -> HTTP fallback for message receive

Pluggable persistence backend
  -> Non-blocking async persistence (refactor to interface first)

Message retry & deduplication on fallback
  -> HTTP fallback for message receive
  -> HTTP fallback for message send

Debounced/batched persistence writes
  -> Non-blocking async persistence
```

## MVP Recommendation

**Prioritize:**
1. **Non-blocking async persistence** — eliminates the most acute production risk (event-loop blocking).
2. **Backward-compatible store API** — protects existing consumers and tests.
3. **HTTP fallback for message send** — simpler than receive (outbound POST to WeCom API).
4. **HTTP fallback for message receive** — requires exposing an HTTP handler for WeCom callbacks.
5. **Graceful transport switching** — unifies the two transports so `BotOrchestrator` does not need to change.

**Defer:**
- **Debounced/batched persistence writes**: Nice optimization, but async I/O alone solves the blocking problem.
- **Pluggable persistence backend**: Good architecture move, but can be added after async refactor without breaking changes.
- **Streaming reply compatibility over HTTP**: WeCom HTTP API limitations make this high-effort, low-payoff.
- **Automatic transport health detection**: Start with manual/binary fallback; add health detection if operational pain emerges.

## Sources

- Existing codebase analysis (`src/memory.ts`, `src/client.ts`, `src/ws.ts`, `src/api.ts`, `src/types/api.ts`)
- `.planning/PROJECT.md` milestone requirements
- `.planning/codebase/ARCHITECTURE.md` transport and persistence patterns
