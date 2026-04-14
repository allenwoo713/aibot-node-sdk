# Domain Pitfalls

**Domain:** WeCom AI Bot SDK — async persistence and HTTP fallback
**Researched:** 2026-04-14

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Fire-and-Forget Async Persistence Without Backpressure
**What goes wrong:** Replacing `fs.writeFileSync` with `fs.promises.writeFile` but calling it unawaited on every `append()` leads to unbounded concurrent disk writes. Under load, the Node.js thread pool saturates, newer writes overwrite older in-flight writes, and the JSON file becomes corrupt.

**Why it happens:** `ConversationStore.append()` is invoked synchronously from `BotOrchestrator.handleTextMessage()` after every assistant reply. If `save()` becomes async but callers do not await it, multiple overlapping serializations race to the same file.

**Consequences:**
- Corrupt or truncated JSON state files
- Lost conversation history after restart
- EMFILE/ENOSPC errors under burst load
- Silent data loss because `save()` currently swallows all exceptions

**Prevention:**
- Serialize saves through a single write queue per `ConversationStore` instance (e.g., a `p-retry` queue or a mutex around the write path).
- Coalesce rapid appends: defer the actual disk write by 50-200 ms and flush only the latest state.
- Use atomic writes (write to temp file + `fs.rename`) so readers never see a partially written file.

**Detection:**
- Load-test with 100+ messages/sec and inspect `persistencePath` for malformed JSON.
- Monitor `fs.writeFile` promise rejection rates and thread-pool latency (`process._getActiveRequests()`).

**Phase to address:** Phase 1 (Async persistence refactor)

---

### Pitfall 2: Breaking Synchronous API Contracts for Existing Consumers
**What goes wrong:** `ConversationStore` is instantiated directly by SDK consumers and by `BotOrchestrator`. If `save()`, `append()`, `clear()`, or `clearAll()` are changed to return `Promise<void>` without a synchronous compatibility shim, external callers break at compile time or runtime.

**Why it happens:** The milestone explicitly requires backward compatibility for existing `ConversationStore` API consumers, but a naive async refactor changes method signatures.

**Consequences:**
- TypeScript compilation failures in downstream projects
- Runtime `undefined` being treated as a `Promise` (or vice versa)
- Loss of trust in SDK stability

**Prevention:**
- Keep the public API surface synchronous where it was originally synchronous, or provide dual async/sync variants (e.g., `append()` stays sync in signature but enqueues an async flush internally).
- If async signatures are unavoidable, expose a new `AsyncConversationStore` class and deprecate the old one gradually.
- Add a compatibility test that imports `ConversationStore` using the old sync signatures.

**Detection:**
- Run `tsc --noEmit` against a fixture that uses the pre-milestone API.
- Review all call sites of `new ConversationStore()` in the repo and in example code.

**Phase to address:** Phase 1 (Async persistence refactor)

---

### Pitfall 3: HTTP Fallback Causes Duplicate Message Processing
**What goes wrong:** When WebSocket drops and HTTP fallback (WeCom push/callback) takes over, the same message can be delivered over both transports if the failover timing overlaps. The bot replies twice to the same user message.

**Why it happens:** WeCom's HTTP callback and WebSocket push are independent channels. There is no built-in exactly-once guarantee across both. The SDK currently has no idempotency key check — it processes every frame it receives.

**Consequences:**
- Users see double replies, which looks unprofessional
- Rate limits consumed twice
- Anthropic API costs doubled for the same message
- Conversation history contains duplicate entries

**Prevention:**
- Deduplicate inbound messages using a stable idempotency key (`req_id` or a hash of `chatid + msgid + timestamp`) before processing.
- Maintain a small bounded in-memory set of recently processed message IDs (LRU, ~1,000 entries, 5-minute TTL).
- When WebSocket reconnects, pause HTTP fallback processing for a grace period (e.g., 2-3 seconds) to drain in-flight frames.

**Detection:**
- Simulate WebSocket flapping during active HTTP callback traffic and assert reply counts per inbound message.
- Log a metric when a message ID is filtered as a duplicate.

**Phase to address:** Phase 2 (HTTP fallback transport)

---

### Pitfall 4: Reply Ordering Collapses When Transport Switches Mid-Stream
**What goes wrong:** A stream reply (e.g., `replyStream`) starts over WebSocket, the connection drops, and the HTTP fallback path attempts to continue the same `streamId`. WeCom treats the new transport as a separate session and either rejects the continuation or displays it out of order.

**Why it happens:** `WsConnectionManager` maintains a per-`req_id` serial reply queue. HTTP fallback has no equivalent queueing abstraction, and stream state (`streamId`, chunk index) is held only in `BotOrchestrator.handleTextMessage()`.

**Consequences:**
- Broken stream UX: users see partial or reordered chunks
- Unhandled promise rejections when HTTP fallback tries to send a stream continuation
- `BotOrchestrator` crashes mid-reply, leaving the conversation in a bad state

**Prevention:**
- Model HTTP fallback as a second transport implementation behind the same `sendReply` abstraction so the queueing layer is transport-agnostic.
- Treat a transport switch as a stream abort: finish the current stream with an error message and start a fresh reply on the new transport, rather than attempting mid-stream continuation.
- Store active `streamId` state in a transport-independent outbox so retries/resumes are explicit.

**Detection:**
- Integration test that kills WebSocket after chunk 2 of 4 and verifies graceful abort + fresh reply on HTTP fallback.
- Monitor for `streamId` reuse across different transport instances in logs.

**Phase to address:** Phase 2 (HTTP fallback transport)

---

### Pitfall 5: HTTP Fallback Lacks Authentication and Replay Attack Protection
**What goes wrong:** WeCom HTTP callbacks require signature verification (SHA1/SHA256 of token + timestamp + nonce + body). If the HTTP fallback endpoint skips verification, attackers can forge messages. If it only verifies but does not check timestamp freshness, replay attacks are possible.

**Why it happens:** The SDK currently only authenticates over WebSocket (`aibot_subscribe` frame). There is no HTTP middleware or OAuth flow. Adding an HTTP server for fallback without crypto validation opens a new attack surface.

**Consequences:**
- Unauthorized messages injected into bot conversations
- Arbitrary AI replies triggered by forged HTTP callbacks
- Potential data exfiltration via crafted conversation IDs

**Prevention:**
- Reuse the existing `WecomCrypto` module (or add a dedicated callback validator) to verify WeCom's signature on every incoming HTTP request.
- Reject callbacks with timestamps older than 5 minutes or with mismatched signatures.
- Bind the HTTP server to localhost/internal interface by default; require explicit configuration to expose it publicly.

**Detection:**
- Security test suite with forged signatures, missing signatures, and replayed payloads.
- Audit HTTP server route handlers for any path that bypasses verification.

**Phase to address:** Phase 2 (HTTP fallback transport)

---

### Pitfall 6: Async Persistence Constructor Still Blocks on `load()`
**What goes wrong:** Even after `save()` is made async, the `ConversationStore` constructor calls `this.load()`, which uses `fs.readFileSync` and `fs.existsSync`. This means every instantiation of `BotOrchestrator` (or every test) still blocks the event loop at startup.

**Why it happens:** The constructor cannot be async in TypeScript/JS. A common partial refactor fixes the write path but forgets the synchronous read path in `load()`.

**Consequences:**
- Startup latency spikes proportional to persistence file size
- Event-loop blocking during test suite execution
- Docker health checks time out because the process appears unresponsive while loading a large state file

**Prevention:**
- Remove `load()` from the constructor. Introduce an explicit `async init()` or `await store.load()` pattern.
- In `BotOrchestrator`, await `store.load()` before calling `wsClient.connect()`.
- For backward compatibility, make `load()` lazy: the first `get()` or `append()` triggers an async load if not already loaded.

**Detection:**
- Profile `new ConversationStore(...)` with a 10 MB persistence file and check for event-loop blocking via `clinic doctor` or `0x`.
- Search for `readFileSync` and `existsSync` in `memory.ts` after the refactor.

**Phase to address:** Phase 1 (Async persistence refactor)

---

### Pitfall 7: No Retry or Dead-Letter Path for Failed HTTP Fallback Sends
**What goes wrong:** When WebSocket is down and an HTTP fallback send fails (network error, 5xx, rate limit), the message is lost because there is no retry queue or dead-letter mechanism for HTTP outbound messages.

**Why it happens:** The current retry logic (`callWithRetry()`) lives inside the Anthropic adapter and is not reused for transport-layer sends. HTTP fallback is treated as a best-effort one-shot.

**Consequences:**
- Silent message loss during transient outages
- Users never receive a reply even though the bot processed their message
- Inconsistent reliability guarantees between WebSocket (queued + acked) and HTTP (fire-and-forget)

**Prevention:**
- Apply the same retry policy (exponential backoff + jitter) to HTTP fallback sends.
- Introduce a small durable outbox or at least an in-memory retry queue with a max-age (e.g., 60 seconds).
- If all retries exhaust, emit an `error` event and optionally log a dead-letter record so operators can inspect failures.

**Detection:**
- Chaos-test HTTP fallback with a proxy that drops 30% of requests.
- Assert that reply delivery rate meets the same SLO as WebSocket (e.g., >99% after retries).

**Phase to address:** Phase 2 (HTTP fallback transport)

---

## Moderate Pitfalls

### Pitfall 1: Shared Persistence File Corruption in Multi-Process Deployments
**What goes wrong:** The single JSON file (`PERSISTENCE_PATH`) is read and written by one process. If the user scales horizontally (multiple Docker replicas, PM2 cluster mode), processes overwrite each other's state.

**Prevention:**
- Document that the JSON persistence file is single-process only.
- Add a file-locking mechanism (`proper-lockfile`) or switch to SQLite for multi-process safety.
- Log a warning at startup if another process holds the persistence file lock.

**Phase to address:** Phase 1 (Async persistence refactor)

---

### Pitfall 2: Memory Leak from Unbounded Rate-Limit Map
**What goes wrong:** `BotOrchestrator.rateLimits` grows with every unique conversation ID and is never pruned. This is unrelated to the milestone but becomes more visible once async I/O reduces other bottlenecks.

**Prevention:**
- Add TTL-based eviction to `rateLimits` (reuse `conversationTtlMs` or a dedicated window).
- Periodically sweep expired entries in `handleTextMessage()` or via a background interval.

**Phase to address:** Phase 1 or 2 (Opportunistic cleanup)

---

### Pitfall 3: Logging Bypasses Injected Logger During Fallback Errors
**What goes wrong:** `BotOrchestrator` already uses `console.error` directly in `setupEventHandlers()`. HTTP fallback code may repeat this pattern, making it impossible for operators to collect structured logs.

**Prevention:**
- Enforce the injected `Logger` interface in all new code paths.
- Add a lint rule or code-review checklist banning `console.*` in `src/bot/` and `src/ws/`.

**Phase to address:** Phase 2 (HTTP fallback transport)

---

## Minor Pitfalls

### Pitfall 1: Oversized JSON Persistence File Slows Startup
**What goes wrong:** As conversation history grows, the entire store is serialized to one file. Even async I/O cannot fix O(n) startup deserialization.

**Prevention:**
- Cap the number of persisted conversations more aggressively than `maxConversations` (e.g., persist only the 100 most recent).
- Consider sharding persistence by conversation ID prefix.

**Phase to address:** Phase 1 (Async persistence refactor)

---

### Pitfall 2: HTTP Callback Body Parsing Crashes on Binary Uploads
**What goes wrong:** If the HTTP fallback endpoint assumes all incoming WeCom callbacks are JSON text, a malformed or binary payload will throw an unhandled exception and crash the server.

**Prevention:**
- Wrap body parsing in a `try/catch` and return HTTP 400 for invalid payloads.
- Reject non-JSON `Content-Type` before parsing.

**Phase to address:** Phase 2 (HTTP fallback transport)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Async persistence refactor | Concurrent unawaited writes to the same JSON file | Single write queue + atomic rename |
| Async persistence refactor | Breaking sync API contracts | Keep sync surface or provide dual APIs |
| Async persistence refactor | Constructor still blocks on `load()` | Lazy/async initialization pattern |
| HTTP fallback transport | Duplicate message delivery across WS and HTTP | Idempotency key + dedup window |
| HTTP fallback transport | Stream reply breaks on transport switch | Abort and restart stream rather than resume |
| HTTP fallback transport | Missing WeCom callback signature verification | Reuse crypto layer for every HTTP request |
| HTTP fallback transport | HTTP sends have no retry/dead-letter path | Unified retry policy + outbox queue |
| Test coverage | Tests only mock fs, never exercise real disk I/O | Add temp-file integration tests |

## Sources

- Codebase audit: `src/memory.ts`, `src/ws.ts`, `src/client.ts`, `src/bot/index.ts`, `src/api.ts`
- Project requirements: `.planning/PROJECT.md`
- Architecture and concerns: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`
- Domain expertise: Node.js event-loop behavior, WeCom callback API documentation, messaging SDK reliability patterns
