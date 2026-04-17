# Feature Landscape: AI Validation & Persistent Storage

**Domain:** WeCom AI Bot SDK (Node.js) — v1.1 milestone
**Researched:** 2026-04-17
**Confidence:** MEDIUM (no live docs verification due to tool restrictions; based on codebase audit and domain expertise)

## Table Stakes

Features users expect from a production AI SDK. Missing these makes the SDK feel unreliable or unsafe for production use.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Response schema validation** | AI APIs can return malformed, empty, or unexpected content blocks. SDK must not crash when `content` is missing or has the wrong shape. | Low | Validate `response.content` array exists, filter only `type === 'text'`, and guard against empty results before returning to callers. |
| **Structured error classification** | Consumers need to distinguish retryable (5xx, 429, timeout) from fatal (4xx, auth) errors to decide whether to retry or alert. | Low | Map SDK errors to typed categories (`retryable`, `rate_limited`, `auth_invalid`, `unknown`) so orchestrators can branch cleanly. |
| **Configurable retry policy** | Network flakes and transient AI API failures are normal. Hard-coded 1-retry is too rigid for production. | Medium | Expose `maxRetries`, `retryDelayMs`, and `retryBackoffMultiplier` in `BotConfig`. Apply to 5xx, 429, and network timeouts only. |
| **Token usage tracking** | Operators need visibility into input/output tokens per request to monitor costs and tune `maxHistoryMessages`. | Low | `ChatResult.usage` already exists; ensure it is always populated when the API returns it, and log warnings when missing. |
| **Cost/token guards** | Unbounded context windows can explode API costs. The SDK should cap what gets sent to the AI backend. | Medium | Add `maxInputTokens` guard in `BotOrchestrator` or `AnthropicApiAdapter`: if estimated input exceeds the cap, truncate history or return a fallback. |
| **Database-backed conversation persistence** | JSON file persistence is single-process, corruption-prone under crash, and does not survive horizontal scaling. A real DB is expected for production. | Medium | Replace JSON file with SQLite (default) or pluggable MongoDB. Keep `ConversationStore` API surface unchanged. |
| **Backward-compatible `ConversationStore` API** | Existing consumers instantiate `ConversationStore` directly. Breaking method signatures forces migration work. | Low | Keep `get()`, `append()`, `clear()`, `clearAll()`, `buildMessages()` signatures stable. Change only internal implementation. |
| **Graceful degradation on AI failure** | If the AI API is completely down, the bot must still reply with a friendly fallback rather than throwing unhandled errors. | Low | Already implemented (`服务暂时繁忙，请稍后再试。`). Preserve this behavior while surfacing more error metadata. |

## Differentiators

Features that set a mature AI SDK apart. Not strictly required, but valued by production operators.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Pluggable persistence backend** | Allow swapping SQLite for MongoDB, Redis, or a custom store without touching bot logic. | Medium | Extract a `ConversationStore` interface (or abstract class). Provide `SqliteConversationStore` as default and `MongoConversationStore` as optional. |
| **Per-request cost ceiling / budget mode** | Hard-stop a conversation if cumulative token spend exceeds a configurable threshold (e.g., $0.50 per conversation). | Medium | Track running token totals in the store; before each AI call, check budget and return a "budget exceeded" fallback if over. |
| **Input token estimation before API call** | Avoid wasting an API call by estimating tokens locally (e.g., via `tiktoken` or a simple char heuristic) and rejecting oversized payloads early. | Medium | A character-based heuristic is dependency-free and good enough for a guardrail; exact `tiktoken` adds a heavy native dep. |
| **Retry with jitter and exponential backoff** | Prevents thundering herd against the AI API after a transient outage. | Low | Replace fixed delays with `delay * 2^attempt + random()`. Especially important for 429 retries. |
| **Observability hooks (onRetry, onValidationFail, onTokenUsage)** | Operators want to log, meter, or alert on these events without forking the SDK. | Low | Accept optional callback hooks in `BotConfig` or `AnthropicApiAdapter` constructor. |
| **Conversation export / migration** | Production users occasionally need to dump conversation history for audit or migration. | Low | Add `export(conversationId)` and `import(record)` methods on the store interface. |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full prompt injection detection / content moderation** | Building a robust moderation layer is a product, not an SDK feature. Over-engineering for v1.1. | Rely on Anthropic's built-in safety filters. Document that consumers should add their own moderation if needed. |
| **Distributed multi-master sync for conversation state** | Requires consensus protocols (CRDTs, etcd, Raft) far beyond an SDK's scope. | Document that SQLite is single-node and MongoDB is the choice for multi-node deployments. |
| **Real-time streaming token validation** | Trying to validate tokens as they stream adds enormous complexity with minimal reliability gain. | Validate the complete response after the stream finishes. |
| **Built-in LLM evaluation / A-B testing framework** | Evaluation infrastructure is a separate product concern. | Keep the SDK focused on transport, storage, and reliable API calling. |
| **Automatic model fallback (e.g., Claude -> OpenAI)** | Adds provider-specific complexity, credential management, and behavior divergence. | The `AiBackend` interface already allows consumers to plug in their own fallback adapter if they choose. |
| **Encryption-at-rest inside the SDK** | Key management is an operational concern. Adding it inside the SDK creates more problems than it solves. | Rely on filesystem permissions (SQLite) or database-native encryption (MongoDB TLS). |

## Feature Dependencies

```
Response schema validation
  -> Structured error classification
    -> Configurable retry policy

Token usage tracking
  -> Cost/token guards
    -> Per-request cost ceiling / budget mode

Pluggable persistence backend
  -> Database-backed conversation persistence
    -> Backward-compatible ConversationStore API

Input token estimation before API call
  -> Cost/token guards

Retry with jitter and exponential backoff
  -> Configurable retry policy

Observability hooks
  -> Structured error classification
  -> Configurable retry policy
```

### Dependency Notes

- **Response schema validation requires structured error classification:** If validation fails, the error must be classified as retryable or fatal so the retry policy knows what to do.
- **Token usage tracking enables cost guards:** Without usage data, budget features are impossible.
- **Pluggable persistence requires the interface refactor:** You cannot offer SQLite/MongoDB backends without first extracting a store interface.
- **Input token estimation enhances cost guards:** Estimation lets you reject before the API call; usage tracking lets you reject after.

## MVP Recommendation (v1.1)

**Prioritize:**
1. **Response schema validation** — prevents crashes from unexpected AI responses.
2. **Structured error classification** — enables clean retry logic and operator alerting.
3. **Configurable retry policy** — hardens the SDK against transient failures.
4. **Token usage tracking + cost guards** — protects consumers from runaway bills.
5. **SQLite-backed `ConversationStore` (with WAL)** — production-grade persistence, single-node, zero external infra.
6. **Backward-compatible store API** — protects existing consumers and tests.

**Defer:**
- **MongoDB store implementation:** Good to have, but SQLite covers 80% of production use cases for a single-process SDK. Add after SQLite is stable.
- **Per-request cost ceiling / budget mode:** Requires cumulative tracking and product decisions on behavior. Can be added once token usage is solid.
- **Input token estimation:** A nice guardrail, but `maxHistoryMessages` and `maxOutputTokens` already provide coarse bounds.
- **Observability hooks:** Low effort, but only valuable after the core validation/retry/storage work is done.
- **Conversation export / migration:** Operational convenience, not core to the milestone.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Response schema validation | HIGH | LOW | P1 |
| Structured error classification | HIGH | LOW | P1 |
| Configurable retry policy | HIGH | MEDIUM | P1 |
| Token usage tracking + cost guards | HIGH | MEDIUM | P1 |
| SQLite-backed ConversationStore | HIGH | MEDIUM | P1 |
| Backward-compatible store API | HIGH | LOW | P1 |
| Pluggable persistence backend | MEDIUM | MEDIUM | P2 |
| Retry with jitter + exponential backoff | MEDIUM | LOW | P2 |
| Per-request cost ceiling | MEDIUM | MEDIUM | P2 |
| MongoDB store implementation | LOW | MEDIUM | P3 |
| Input token estimation | LOW | MEDIUM | P3 |
| Observability hooks | LOW | LOW | P3 |
| Conversation export / migration | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v1.1
- P2: Should have, add if time allows
- P3: Nice to have, future consideration

## Competitor / Ecosystem Feature Analysis

| Feature | LangChain.js | Vercel AI SDK | Our Approach |
|---------|--------------|---------------|--------------|
| Response validation | Minimal (relies on provider SDK) | Minimal | Explicit schema guards + fallback messages |
| Retry policy | Configurable via `maxRetries` | Configurable via `maxRetries` | Similar, but with error classification and jitter |
| Token tracking | Exposed via provider response | Exposed via `usage` object | Same, plus optional cost-ceiling guard |
| Persistence | None (user-managed) | None (user-managed) | Built-in SQLite store with pluggable interface |
| Store backend choice | Redis/Postgres via external libs | None | SQLite default, MongoDB optional, interface open |

## Sources

- Existing codebase analysis (`src/ai/adapter.ts`, `src/ai/api-adapter.ts`, `src/ai/api-adapter.test.ts`, `src/memory.ts`, `src/memory.test.ts`, `src/bot/index.ts`, `src/config/index.ts`)
- `.planning/PROJECT.md` v1.1 milestone requirements
- `.planning/research/STACK.md` and `.planning/research/PITFALLS.md` from v1.0 (relevant patterns carry forward)
- Domain expertise: AI SDK reliability patterns, SQLite WAL semantics, Node.js embedded database tradeoffs

---
*Feature research for: aibot-node-sdk v1.1 AI validation & persistent storage*
*Researched: 2026-04-17*
