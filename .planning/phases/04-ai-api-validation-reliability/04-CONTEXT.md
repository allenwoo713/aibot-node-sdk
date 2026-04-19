# Phase 4: AI API Validation & Reliability - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Strengthen AI call handling with validation, configurable retries, error classification, token tracking, and cost guards. This phase covers the `AnthropicApiAdapter` and `BotConfig` layers, ensuring robust behavior when the upstream AI API misbehaves or exceeds limits.

</domain>

<decisions>
## Implementation Decisions

### Token Overflow Handling
- **D-01:** When conversation history exceeds `maxInputTokens`, **truncate the oldest messages** to fit within the limit. Keep the most recent messages and the current user message.
- **D-02:** Conversation compaction / summarization when over the limit is **deferred** to a future enhancement (not in this phase).

### Retry Policy
- **D-03:** Default retry policy is **conservative — 1 retry** on retryable errors (5xx and 429), matching the current behavior.
- **D-04:** Retry parameters (`maxRetries`, `baseDelayMs`, `backoffMultiplier`, `jitter`) must be **configurable via `BotConfig`** with sensible defaults.

### Error Surfacing Pattern
- **D-05:** Keep the **existing `ChatResult` pattern**: the adapter returns `{ content, error: true, usage?, errorCode? }` rather than throwing structured errors.
- **D-06:** Introduce **structured error classification** (`retryable`, `rate_limited`, `auth_invalid`, `unknown`) inside `ChatResult` so operators can observe failures without changing the top-level interface contract.
- **D-07:** Throwing typed errors (e.g. `AiRateLimitError`) from `AiBackend` is **deferred** to a future interface evolution.

### Fallback Messaging
- **D-08:** Fallback messages for AI failures must be **configurable per error type** in `BotConfig` (e.g. separate messages for rate limit, auth invalid, validation failure, generic retryable).
- **D-09:** If a specific fallback message is not configured, fall back to a sensible default (can keep the current hardcoded Chinese message as the ultimate default).

### Response Validation
- **D-10:** A response is considered "malformed or empty" when: (a) the API returns an empty `content` array, (b) no text-type content blocks are present, or (c) the concatenated text is empty/whitespace-only. In these cases, return a validated fallback response with `error: true`.

### Claude's Discretion
- Exact truncation strategy (e.g. drop oldest N messages vs. sliding window) can be decided at implementation time as long as `maxInputTokens` is respected.
- Jitter implementation (fixed vs. random) is left to planner/executor discretion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, and requirements mapping
- `.planning/REQUIREMENTS.md` — AIAPI-01 through AIAPI-06 acceptance criteria

### Existing Code
- `src/ai/adapter.ts` — `AiBackend` interface, `ChatOptions`, `ChatResult`
- `src/ai/api-adapter.ts` — Current `AnthropicApiAdapter` with hardcoded retry and error swallowing
- `src/ai/api-adapter.test.ts` — Existing test coverage for the adapter
- `src/config/index.ts` — `BotConfig` interface and `loadConfig()`
- `src/bot/index.ts` — `BotOrchestrator` and how it consumes `ChatResult`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatResult` already has a `usage?: { input_tokens; output_tokens }` field — token tracking only needs to be populated and forwarded.
- `BotConfig` and `loadConfig()` provide a clear place to add retry policy and fallback message configuration fields.

### Established Patterns
- Best-effort error suppression: the adapter currently catches all errors and returns a fallback string. We are preserving this pattern while adding structured classification.
- Environment-based configuration: all tunables are loaded from `process.env` via `getEnv()` / `getEnvInt()` in `src/config/index.ts`.

### Integration Points
- `AnthropicApiAdapter.chat()` is called by `BotOrchestrator.handleTextMessage()`.
- Changes to `ChatResult` or `BotConfig` may require updates to `BotOrchestrator` and unit tests.

</code_context>

<specifics>
## Specific Ideas

- The user noted that **conversation compaction / summarization** is the ideal long-term approach for token overflow, but should be deferred until the pipeline is solid.
- The user noted that **throwing structured typed errors** (option 2) is more reasonable architecturally, but should be kept as a future TODO to avoid breaking the existing interface contract in this phase.

</specifics>

<deferred>
## Deferred Ideas

- **Conversation compaction/summarization** when token limit is exceeded — belongs in a future AI optimization phase.
- **Throwing structured errors from `AiBackend`** — a future interface evolution when the SDK is ready for a breaking change or v2 interface.

</deferred>

---

*Phase: 04-ai-api-validation-reliability*
*Context gathered: 2026-04-17*
