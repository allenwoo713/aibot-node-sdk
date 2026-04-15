# Phase 2: HTTP Fallback Transport - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 02-HTTP Fallback Transport
**Areas discussed:** Transport interface scope, Fallback activation strategy

---

## Transport Interface Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — only what BotOrchestrator needs | sendText, sendStream, on('message.text'). Thin abstraction matching AiBackend pattern. | ✓ |
| Full — mirror WSClient's public API | sendMessage, replyStream, replyTemplateCard, uploadMedia, etc. Flexible but larger surface area. | |
| You decide | Let planner choose. | |

**User's choice:** Minimal first, full API as next step (deferred)
**Notes:** User explicitly wants to defer the full WSClient API mapping to a future enhancement. Follow the existing `AiBackend` minimal-adapter pattern.

---

## Fallback Activation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Config-driven only | HTTP used only when wsUrl is omitted/empty. Single transport at construction time. | |
| Runtime switch on WebSocket failure | WebSocket primary; automatic fallback to HTTP on connect failure or drop. | ✓ |
| Both config-driven + runtime switch | Explicit HTTP-only mode plus automatic fallback. Most flexible. | |
| You decide | Let planner choose. | |

**User's choice:** Runtime switch on WebSocket failure
**Notes:** Bidirectional fallback (send + receive over HTTP) with auto-recovery to WebSocket when it re-establishes. HTTP callback should stay registered during transition to avoid message loss.

---

## Claude's Discretion

- HTTP callback handler shape — planner decides (recommended: framework-agnostic function)
- access_token caching scope — planner decides (recommended: in-memory with refresh-lock)
- Duplicate filtering during transition — planner decides (recommended: short-lived msgid Set)
- Transport method naming — planner decides

## Deferred Ideas

- Full Transport API matching WSClient — noted for future phase
- HTTP media upload fallback — already out of scope
- Persistent access_token storage — not required now
