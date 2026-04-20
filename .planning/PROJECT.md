# aibot-node-sdk

## What This Is

A TypeScript SDK and bot service for WeCom (WeChat Work) integration, with an AI orchestrator layer powered by Anthropic Claude. The SDK handles WebSocket transport, message framing, file download/decryption, and AI-driven conversation replies with memory.

## Core Value

Developers can integrate a production-ready AI bot into WeCom with minimal setup, while the SDK provides reliable real-time messaging and extensible architecture.

## Target Audience

- Node.js developers building WeCom bots
- Teams needing AI-assisted customer support or internal assistants inside WeCom

## Current State

**Milestone v1.1 shipped.**

- AI API calls are resilient with configurable retries, response validation, structured error classification, token tracking, and input truncation
- Conversation persistence is pluggable: JSON file backend (backward-compatible) or SQLite with WAL mode
- SDK public API exports persistence layer (`ConversationStore`, `PersistenceBackend`, `JsonFileBackend`, `SqliteBackend`)
- Docker image builds and runs correctly with better-sqlite3 native addon and persistent data volume
- Full test coverage: 98/98 tests passing across 15 test files
- Graceful shutdown ensures SQLite WAL flush before process exit on SIGINT/SIGTERM

## Current Milestone: v1.2 WeCom Ecosystem Extension

**Goal:** 接入企微开放平台 API 扩展 AI 能力边界，并提供 Docker Compose 生产部署方案。

**Target features:**
- Docker Compose 部署 (compose.yml, 健康检查, 数据卷持久化)
- 企微开放平台 API 客户端 (access_token 获取与自动刷新)
- 微盘文档读取与分析（Bot 通过 `/文档` 指令触发）
- 日程创建与查询（Bot 通过 `/日程` 指令触发）
- 新增功能的测试覆盖

## Next Milestone Goals

*(To be defined after v1.2)*

Potential directions:
- Observability: metrics, structured logging, health checks
- Multi-tenant support: per-corp configuration, isolation
- Performance: connection pooling, response streaming
- Security: input sanitization, rate limiting per corp
- Bot 多消息类型处理: image, voice, file, mixed, video

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
<summary>Archived v1.1 Content</summary>

## Validated (v1.1)

- AI API response validation with fallback on malformed/empty content blocks — Phase 4
- Configurable retry policies (maxRetries, base delay, backoff, jitter) via BotConfig — Phase 4
- Retry logic distinguishing retryable (429, 5xx, timeout) vs permanent (400, 401, 403, 404, 422) errors — Phase 4
- Structured error classification (retryable, rate_limited, auth_invalid, validation_failed, unknown) — Phase 4
- Token usage tracking in ChatResult — Phase 4
- Input payload truncation before API call to prevent runaway costs — Phase 4
- Pluggable PersistenceBackend interface — Phase 5
- JsonFileBackend with atomic file writes — Phase 5
- SqliteBackend with WAL mode and serialized writes — Phase 5
- ConversationStore.get() remains synchronous with in-memory LRU cache — Phase 5
- Auto-migration from JSON to SQLite on first startup — Phase 5
- Parameterized shared behavior tests for all backends — Phase 5
- BotOrchestrator.stop() closes persistence before transport teardown — Phase 6
- entry.ts async graceful shutdown on SIGINT/SIGTERM — Phase 6
- Dockerfile production stage with better-sqlite3 native addon — Phase 6
- SDK public API exports persistence classes — Phase 6

## Key Decisions (v1.1)

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AI retry defaults: maxRetries=1, retryBaseDelayMs=2000, retryBackoffMultiplier=2, retryJitter=true | Balance reliability vs latency for chat UX | Validated in production — retries handle transient failures without excessive delay |
| Disable Anthropic SDK built-in retry (maxRetries: 0) | Avoid double retry layers — SDK retry + our retry | Validated — custom retry loop provides full control over classification and backoff |
| better-sqlite3 with WAL mode | Single-node, synchronous, robust for bot persistence | Validated — Docker restart and SIGTERM both preserve data correctly |
| Migration renames (not deletes) original JSON file | Safety — allows rollback if migration fails | Validated — unit tests confirm idempotency and corrupt-JSON handling |
| Fallback messages in Chinese | Match existing WeCom bot UX | Validated — consistent with v1.0 user experience |
| FallbackTransport dedup key = `${msgid}:${eventName}` | Fix cross-transport event dropping | Validated — bot now receives all message events correctly |

</details>

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
*Last updated: 2026-04-20 after v1.1 milestone*
