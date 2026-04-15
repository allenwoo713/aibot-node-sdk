# Phase 2: HTTP Fallback Transport - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 2

<domain>
## Phase Boundary

Add WeCom HTTP API send/receive capabilities as a fallback when WebSocket is unavailable. Introduce a unified `Transport` interface so `BotOrchestrator` does not depend on WebSocket-specific APIs. Implement:
- Access token caching with automatic refresh
- HTTP callback handler for receiving WeCom push events
- SHA1 signature verification and AES-256-CBC decryption for callbacks
- Normalization of HTTP push payloads into `WsFrame` objects flowing through `MessageHandler`

</domain>

<decisions>
## Implementation Decisions

### Transport Interface Scope (User Decision)
- **D-01:** The `Transport` interface should be **minimal** — expose only what `BotOrchestrator` needs:
  - `sendText(replyTo, text)` or equivalent for sending replies
  - `on('message.text', handler)` or equivalent for receiving messages
  - Methods for connect/start and disconnect/stop lifecycle
- **Rationale:** Keeps the abstraction thin, consistent with the existing `AiBackend` adapter pattern. Avoids leaking WS-specific features (uploadMedia, template cards, stream replies) into the transport contract.
- **Implementation hint:** Follow the `AiBackend` pattern in `src/ai/adapter.ts` — minimal surface area, injected into `BotOrchestrator`.

### Fallback Activation Strategy (User Decision)
- **D-02:** WebSocket is the **primary** transport. HTTP fallback activates **automatically at runtime** when WebSocket fails to connect or drops.
- **D-03:** Fallback is **bidirectional** — both incoming messages (via WeCom HTTP callback) and outgoing replies (via WeCom HTTP message API) flow through HTTP when WebSocket is down.
- **D-04:** The SDK **auto-recovers** to WebSocket when the connection re-establishes. HTTP callback handlers should remain registered as a secondary inbound path to prevent message loss during transitions.
- **Rationale:** Maximizes availability without requiring manual config changes. Receiving via both paths during transition avoids dropped messages.
- **Implementation hint:** `Transport` implementation can wrap both `WsConnectionManager` and an HTTP sender. A state machine tracks which outbound path is active. Inbound messages can be deduplicated by `msgid` if both paths deliver the same event.

### Claude's Discretion
- **HTTP callback handler shape:** Planner decides the cleanest signature. Recommended: a framework-agnostic function `(payload: CallbackPayload) => Promise<CallbackResponse>` that can be wrapped by Express/Fastify/Koa adapters. The SDK should not take a direct framework dependency.
- **access_token caching:** Planner decides cache mechanism. Recommended: in-memory cache with refresh-lock (Promise-based) in the HTTP transport implementation. Persistent token storage is not required for this phase.
- **Duplicate filtering:** Planner decides deduplication strategy for the transition window where both WebSocket and HTTP may deliver the same message. Recommended: short-lived in-memory `Set<string>` of seen `msgid` values with a 5-minute TTL.
- **Transport method naming:** Planner should align with existing `WSClient` terminology where possible to minimize `BotOrchestrator` refactoring.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/REQUIREMENTS.md` — Phase 2 requirements (TRANS-01 through TRANS-05, COMPAT-03, TEST-02)
- `.planning/ROADMAP.md` — Phase 2 goal and success criteria
- `.planning/PROJECT.md` — Project scope, key decisions, and out-of-scope items
- `.planning/phases/01-async-persistence-refactor/01-CONTEXT.md` — Phase 1 decisions (lazy init pattern, logger injection)

### Existing Code
- `src/types/api.ts` — `WsFrame<T>` envelope type and command constants
- `src/client.ts` — `WSClient` public API and event emitter setup
- `src/ws.ts` — `WsConnectionManager` lifecycle, auth, reply queues
- `src/bot/index.ts` — `BotOrchestrator` integration point (currently hardcodes `WSClient`)
- `src/message-handler.ts` — `MessageHandler.handleFrame` normalizes frames into events
- `src/api.ts` — `WeComApiClient` (existing axios-based HTTP client, currently file-download only)
- `src/config/index.ts` — `BotConfig` shape; `wsUrl` is already optional
- `src/ai/adapter.ts` — `AiBackend` interface pattern (minimal adapter surface)
- `src/wecom-crypto/index.ts` — AES-256-CBC and SHA1 utilities already available

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WeComApiClient` (`src/api.ts`): Already has an axios instance with JSON headers. Can be extended with message-sending and access-token methods.
- `WecomCrypto` (`src/wecom-crypto/index.ts`): Provides AES decrypt and SHA1 signature verification — exactly what HTTP callback validation needs.
- `MessageHandler` (`src/message-handler.ts`): Can be reused to normalize HTTP push payloads into typed events if they are shaped as `WsFrame`.
- `generateReqId` (`src/utils.ts`): Can be used to generate `req_id` for HTTP-callback-derived frames.

### Established Patterns
- **Adapter pattern:** `AiBackend` is a minimal interface with a single implementation. The `Transport` interface should follow the same pattern.
- **Event-driven architecture:** `WSClient` extends `eventemitter3`. The `Transport` abstraction should preserve typed event emission so `BotOrchestrator` can keep using `.on('message.text', ...)`.
- **Best-effort error suppression:** Errors in lower layers are often logged and swallowed rather than thrown. HTTP transport errors should follow this pattern where appropriate.

### Integration Points
- `BotOrchestrator` currently constructs `WSClient` in its constructor. It must be changed to accept a `Transport` interface instead.
- `src/index.ts` (SDK barrel) will need to export the new `Transport` interface and HTTP transport implementation.
- `src/bot/entry.ts` will need to instantiate the appropriate transport based on configuration.

</code_context>

<specifics>
## Specific Ideas

- Keep `ws` as the primary transport; HTTP is a fallback, not a replacement.
- The HTTP callback handler should be usable without pulling in Express or any web framework.
- WeCom HTTP API requires `access_token` which expires every 2 hours. Cache it in memory and refresh automatically on 42001 errors.
- Normalize HTTP push payloads into `WsFrame` so `MessageHandler` can consume them without changes.

</specifics>

<deferred>
## Deferred Ideas

- **Full Transport API matching WSClient:** Exposing sendMessage, replyTemplateCard, uploadMedia, etc. through the Transport abstraction — deferred to a future enhancement phase.
- **HTTP media upload fallback:** WeCom HTTP media upload API is complex; out of scope per REQUIREMENTS.md.
- **Persistent access_token storage:** Redis/pluggable backend for multi-process deployments — not required for this phase.
- **Automatic transport health detection beyond WS connect/disconnect:** Binary fallback is sufficient for now.

</deferred>

---

*Phase: 02-http-fallback-transport*
*Context gathered: 2026-04-15 via /gsd-discuss-phase 2*
