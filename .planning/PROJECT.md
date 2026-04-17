# aibot-node-sdk

## What This Is

A TypeScript SDK and bot service for WeCom (WeChat Work) integration, with an AI orchestrator layer powered by Anthropic Claude. The SDK handles WebSocket transport, message framing, file download/decryption, and AI-driven conversation replies with memory.

## Core Value

Developers can integrate a production-ready AI bot into WeCom with minimal setup, while the SDK provides reliable real-time messaging and extensible architecture.

## Target Audience

- Node.js developers building WeCom bots
- Teams needing AI-assisted customer support or internal assistants inside WeCom

## Current State

**Milestone v1.0 shipped.**

- `ConversationStore` uses fully async I/O with a write queue and lazy initialization
- `Transport` abstraction supports WebSocket primary + HTTP fallback seamlessly
- `BotOrchestrator` is transport-agnostic and backward-compatible
- Full test coverage: 61/61 tests passing, including E2E for WebSocket multi-turn, HTTP callback, fallback routing, and entry smoke
- Live WebSocket UAT verified against the official WeCom gateway (`wss://openws.work.weixin.qq.com`)

## Current Milestone: v1.1 AI Validation & Persistent Storage

**Goal:** Strengthen AI call reliability with validation, retries, and cost guards, while replacing JSON-based conversation persistence with a robust database-backed store.

**Target features:**
- AI API call validation (response schema checks, error classification, retry policies, token/cost guards)
- Conversation persistent storage research + implementation (JSON vs SQLite+WAL vs MongoDB)
- Backward-compatible `ConversationStore` API
- Maintained or improved test coverage

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

<details>
<summary>Archived v1.0 Content</summary>

## Validated (v1.0)

- WebSocket connection management with auto-reconnect and auth — existing
- Typed message framing and event dispatch (`MessageHandler`) — existing
- WeCom file download with AES-256-CBC decryption and SHA1 verification — existing
- AI backend adapter (`AiBackend`) with Anthropic implementation — existing
- In-memory conversation store with TTL, LRU, sliding window — existing
- JSON-based conversation persistence (`ConversationStore`) — existing
- Bot orchestrator with rate limiting and contact type detection — existing
- Docker-based deployment with rollup bundling — existing
- Replace synchronous file I/O in `ConversationStore` with async I/O to eliminate event-loop blocking — Phase 01
- Add HTTP fallback transport so messages can be received/sent when WebSocket is unavailable — Phase 02
- Ensure backward compatibility for existing `ConversationStore` API consumers — Phase 01
- Maintain or improve test coverage for persistence and transport layers — Phase 03

## Key Decisions (v1.0)

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Async persistence keeps JSON file format | Minimizes migration risk for existing deployments | Completed in Phase 01 — no breaking changes for consumers |
| HTTP fallback uses WeCom official push + callback APIs | Aligns with WeCom platform conventions | Completed in Phase 02 — real HTTP server and crypto signatures validated in E2E tests |
| Keep `ws` as primary transport, HTTP as fallback | WebSocket is the optimized path; HTTP fills availability gaps | Completed in Phase 02 — FallbackTransport routes seamlessly between transports |

</details>

---
*Last updated: 2026-04-17 after starting v1.1 milestone*
