# Roadmap

## Phases

- [x] **Phase 1: Async Persistence Refactor** - Replace synchronous file I/O in `ConversationStore` with async I/O, internal write queue, and backward-compatible API
- [ ] **Phase 2: HTTP Fallback Transport** - Add WeCom HTTP API send/receive capabilities with access token caching, callback handling, and unified `Transport` interface
- [ ] **Phase 3: Integration & E2E Validation** - Verify `BotOrchestrator` works seamlessly across WebSocket and HTTP transports with end-to-end tests

## Phase Details

### Phase 1: Async Persistence Refactor
**Goal**: `ConversationStore` uses fully async I/O without blocking the event loop, while keeping API backward-compatible
**Depends on**: Nothing (first phase)
**Requirements**: PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04, PERSIST-05, COMPAT-01, COMPAT-02, TEST-01
**Success Criteria** (what must be TRUE):
  1. `ConversationStore` reads and writes conversation data without using any synchronous `fs` methods
  2. Concurrent writes to the same JSON file are serialized through an internal queue, preventing corruption
  3. Existing external consumers of `ConversationStore` do not need to change their code (API signature preserved)
  4. Corrupt or missing persistence files are handled gracefully without crashing the process
  5. Unit tests verify concurrent write serialization and error recovery behaviors
**Plans**: 2 plans

Plan list:
- [x] `01-01-PLAN.md` — Refactor `ConversationStore` to async I/O with lazy init and write queue
- [x] `01-02-PLAN.md` — Update `BotOrchestrator` callers and add unit tests for concurrency and error recovery

### Phase 2: HTTP Fallback Transport
**Goal**: SDK can send and receive messages via WeCom HTTP APIs when WebSocket is unavailable, with unified Transport abstraction
**Depends on**: Phase 1
**Requirements**: TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, COMPAT-03, TEST-02
**Success Criteria** (what must be TRUE):
  1. SDK can send WeCom text messages via HTTP API using a cached access_token with automatic refresh
  2. A framework-agnostic callback handler can receive, verify, decrypt, and normalize WeCom HTTP push events into `WsFrame` objects
  3. `BotOrchestrator` sends and receives messages through a `Transport` interface without knowing whether WebSocket or HTTP is active
  4. Unit and integration tests cover HTTP message sending, callback verification, decryption, and duplicate filtering
**Plans**: 4 plans

Plan list:
- [ ] `02-01-PLAN.md` — Create Transport interface, extend WeComApiClient with token/message APIs, and build WsTransport wrapper
- [ ] `02-02-PLAN.md` — Implement HttpTransport with TokenCache, framework-agnostic callback handler, and FallbackTransport
- [ ] `02-03-PLAN.md` — Refactor BotOrchestrator to accept Transport, wire FallbackTransport in entry point, and update SDK exports
- [ ] `02-04-PLAN.md` — Add unit tests for HttpTransport, callback handler, and FallbackTransport routing/deduplication

### Phase 3: Integration & E2E Validation
**Goal**: Bot orchestrator works seamlessly across both WebSocket and HTTP transports, verified by end-to-end tests
**Depends on**: Phase 2
**Requirements**: TEST-03
**Success Criteria** (what must be TRUE):
  1. End-to-end tests demonstrate the bot handling a complete conversation flow using WebSocket transport
  2. End-to-end tests demonstrate the bot handling a complete conversation flow using HTTP callback transport
  3. The same `BotOrchestrator` configuration can operate with either transport without code changes
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Async Persistence Refactor | 2/2 | Complete | - |
| 2. HTTP Fallback Transport | 0/4 | Planned | - |
| 3. Integration & E2E Validation | 0/0 | Not started | - |
