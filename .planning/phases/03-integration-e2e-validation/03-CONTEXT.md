# Phase 3: Integration & E2E Validation - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 3

<domain>
## Phase Boundary

Verify `BotOrchestrator` works seamlessly across WebSocket and HTTP transports, validated by end-to-end tests. This phase focuses on:
- E2E tests covering WebSocket transport conversation flows
- E2E tests covering HTTP callback transport conversation flows
- Proof that the same `BotOrchestrator` configuration can operate with either transport without code changes
- A smoke test validating the entry-point wiring (`src/bot/entry.ts`)
</domain>

<decisions>
## Implementation Decisions

### E2E Conversation Flow Depth (User Decision)
- **D-01:** E2E tests must demonstrate a **multi-turn back-and-forth** conversation: user asks, bot replies, user follows up, bot replies again.
- **Rationale:** Tests history/context continuity across the conversation, not just a single request-response cycle.
- **Implementation hint:** Use the same `conversationId` (e.g., `from.userid`) for both turns. Assert that the AI adapter receives prior messages in the `history` array on the second turn.

### HTTP Callback Test Strategy (User Decision)
- **D-02:** Exercise the HTTP callback path by spinning up an **actual Node.js HTTP server** inside the test process and POSTing real requests to it.
- **Rationale:** Tests the full network stack and validates that the callback handler integrates correctly with real HTTP semantics (headers, body parsing, response status).
- **Implementation hint:** Use Node.js `http.createServer()` in the test setup. Generate real WeCom signatures and encrypted payloads using `WecomCrypto` so the callback handler verifies and decrypts them exactly as it would in production. Clean up the server in `afterEach`.

### Entry Point Validation (User Decision)
- **D-03:** Add a **smoke test** for `src/bot/entry.ts` that loads config and instantiates the full stack (`WsTransport` + `HttpTransport` + `FallbackTransport` + `BotOrchestrator`) to prove wiring works without runtime errors.
- **Rationale:** The entry point is the actual runtime boundary. A smoke test catches import errors, constructor mismatches, and missing config fields that unit tests might miss.
- **Implementation hint:** Mock `loadConfig()` to return a valid `BotConfig`, then dynamically import `src/bot/entry.ts` (or test its wiring logic directly). Call `bot.stop()` in cleanup. Do not assert business behavior — assert that instantiation succeeds and transports are wired.

### Claude's Discretion
- **Mixed transport / fallback coverage:** Planner decides the exact BotOrchestrator-level E2E for `FallbackTransport`. Recommended: at least one test that injects `FallbackTransport`, triggers a message via the primary transport, simulates WebSocket disconnect (emit `disconnected`), and triggers a second message via the fallback path (HTTP callback), asserting replies route correctly. `FallbackTransport` already has dedicated unit tests for deduplication and routing.
- **Test environment boundaries:** Planner decides mocking strategy for external APIs. Recommended: continue mocking Anthropic API (`AnthropicApiAdapter`) and WeCom WebSocket (`WSClient`) as in existing tests. Mock or intercept WeCom HTTP message API calls (e.g., `nock` or axios mock) for HTTP transport E2E.
- **E2E file organization:** Planner decides whether to extend `__tests__/bot.e2e.test.ts` or create new files. Recommended: `__tests__/bot.e2e.test.ts` for WebSocket flows, `__tests__/bot.http.e2e.test.ts` for HTTP callback flows, `__tests__/bot.entry.smoke.test.ts` for entry-point smoke test.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/REQUIREMENTS.md` — Phase 3 requirement (TEST-03)
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria
- `.planning/PROJECT.md` — Project scope, key decisions, and out-of-scope items
- `.planning/phases/02-http-fallback-transport/02-CONTEXT.md` — Transport interface decisions and fallback strategy

### Existing Code
- `src/bot/index.ts` — `BotOrchestrator` integration point
- `src/bot/entry.ts` — Entry point wiring `FallbackTransport` + `BotOrchestrator`
- `src/bot/index.test.ts` — Existing unit tests for BotOrchestrator
- `__tests__/bot.e2e.test.ts` — Existing WebSocket E2E tests
- `src/transport/ws-transport.ts` — WebSocket transport wrapper
- `src/transport/http-transport.ts` — HTTP transport with `TokenCache`
- `src/transport/http-callback.ts` — `handleCallback` for WeCom HTTP push events
- `src/transport/fallback-transport.ts` — `FallbackTransport` routing and deduplication
- `src/wecom-crypto/index.ts` — `WecomCrypto` for signature verification and AES decryption
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `__tests__/bot.e2e.test.ts`: Existing E2E test pattern — mocks `WSClient`, `AnthropicApiAdapter`, and `generateReqId`, then asserts on `bot.transport`.
- `src/transport/http-callback.ts`: `handleCallback` expects `CallbackPayload`, `WecomCrypto`, and a `Transport` emitter. Can be wired to a real HTTP server in tests.
- `src/wecom-crypto/index.ts`: Provides `getSignature()`, `verifySignature()`, and `decrypt()` — exactly what's needed to generate valid test payloads for the HTTP callback E2E.

### Established Patterns
- **E2E tests live in `__tests__/`**: Existing E2E tests use vitest with `vi.mock()` for SDK internals.
- **Mocked external APIs**: Anthropic API and WeCom WebSocket are mocked in tests. WeCom HTTP APIs should also be mocked (e.g., via axios mock or `nock`).
- **Event-driven transport testing**: Messages are injected by emitting on `(bot as any).transport.emit('message.text', frame)`.
- **Persistence path isolation**: Tests use `.test-bot-state.json` (E2E) and `.test-bot-state-unit.json` (unit) to avoid parallel test collisions on Windows.

### Integration Points
- `BotOrchestrator` accepts a `Transport` in its constructor, defaulting to `WsTransport` if not provided.
- `FallbackTransport` switches outbound routing based on `primaryActive` (driven by `connected`/`disconnected` events from `WsTransport`).
- `handleCallback` normalizes HTTP push payloads to `WsFrame` and feeds them through `MessageHandler`, which emits typed events on the provided `Transport`.
</code_context>

<specifics>
## Specific Ideas

- WebSocket E2E should be extended from single-turn to multi-turn, keeping the same mock patterns.
- HTTP callback E2E should create a real HTTP server, generate a valid WeCom callback payload (signature + encrypted body), POST it, and assert the bot replies via the HTTP transport path.
- Entry smoke test should verify that `entry.ts` can be imported/instantiated with mocked config without throwing.
- For HTTP transport replies, mock the underlying `WeComApiClient.sendTextMessage` or intercept axios so no real WeCom API calls are made.
</specifics>

<deferred>
## Deferred Ideas

- Performance/load testing of transport switching — out of scope
- Real WeCom API integration tests — out of scope (requires live credentials)
- Docker-compose based E2E with real services — out of scope for this milestone
</deferred>

---

*Phase: 03-integration-e2e-validation*
*Context gathered: 2026-04-15 via /gsd-discuss-phase 3*
