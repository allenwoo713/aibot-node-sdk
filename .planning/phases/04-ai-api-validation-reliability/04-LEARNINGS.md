---
phase: 4
phase_name: "AI API Validation & Reliability"
project: "aibot-node-sdk"
generated: "2026-04-20T00:00:00Z"
counts:
  decisions: 8
  lessons: 4
  patterns: 4
  surprises: 3
missing_artifacts:
  - "VERIFICATION.md"
---

# Phase 4 Learnings: AI API Validation & Reliability

## Decisions

### Structured Error Classification with 5-Value Literal Union
Added `errorCode?: 'retryable' | 'rate_limited' | 'auth_invalid' | 'validation_failed' | 'unknown'` to `ChatResult`. This replaces opaque boolean `error` flags with typed, actionable error categories that downstream code can observe and log.

**Rationale:** BotOrchestrator needs to distinguish between transient failures (can be retried silently) and permanent failures (should alert operators). A literal union provides compile-time safety and exhaustive handling.
**Source:** 04-01-PLAN.md, 04-01-SUMMARY.md

---

### Disable Anthropic SDK Built-In Retry
Set `maxRetries: 0` in the Anthropic client constructor to disable the SDK's internal retry mechanism, replacing it with a fully custom retry loop.

**Rationale:** The SDK's built-in retry lacks configurable classification logic, jitter control, and per-error-type fallback messages. Running both SDK retry and custom retry creates unpredictable double-retry layers with overlapping backoff timings.
**Source:** 04-02-PLAN.md, 04-02-SUMMARY.md, STATE.md

---

### Custom Retry Loop with Exponential Backoff and Jitter
Implemented `calculateDelay(attempt)` using `baseDelay * (multiplier ** attempt)` multiplied by random jitter between 0.5x and 1.0x.

**Rationale:** Exponential backoff prevents thundering-herd against recovering APIs; jitter desynchronizes retry storms across multiple bot instances. The formula is simple, deterministic for testing (jitter can be disabled), and bounded.
**Source:** 04-02-PLAN.md

---

### Fail-Fast on Permanent Errors
Retry loop skips retries for HTTP 400, 401, 403, 404, and 422, retrying only 429, 5xx, and network timeout errors.

**Rationale:** Retrying authentication failures or malformed requests wastes tokens and delays user response. Classifying these as non-retryable returns a fallback message immediately.
**Source:** 04-02-PLAN.md, 04-02-SUMMARY.md

---

### Fallback Messages in Chinese
All default fallback messages are in Chinese to match the existing WeCom bot user experience.

**Rationale:** The bot's primary audience is Chinese-speaking WeCom users. Consistent language in error messages maintains trust and reduces confusion.
**Source:** 04-01-SUMMARY.md, STATE.md

---

### Token Truncation with Character-Count/4 Heuristic
`truncateMessages()` estimates tokens per message as `Math.ceil(content.length / 4)` and drops oldest messages until the total is under `maxInputTokens`.

**Rationale:** Precise token counting requires a tokenizer dependency which adds weight and complexity. For a chat bot, the character-count heuristic is "good enough" and keeps the SDK dependency-light. The 4-character-per-token ratio is a pragmatic approximation for mixed CJK/English text.
**Source:** 04-02-PLAN.md

---

### Retry Defaults Balanced for Chat UX
Defaults chosen: `maxRetries=1`, `retryBaseDelayMs=2000`, `retryBackoffMultiplier=2`, `retryJitter=true`.

**Rationale:** Chat UX is latency-sensitive; multiple retries with long backoffs make the bot feel unresponsive. A single retry with 2s base delay handles most transient failures without excessive wait. The default was validated in production.
**Source:** 04-01-SUMMARY.md, STATE.md, PROJECT.md

---

### BotOrchestrator Logs Structured Metadata Only
`logger.warn` on AI errors logs only `conversationId` and `errorCode`; `logger.debug` on success logs only token counts. Raw error objects and message content are never logged.

**Rationale:** Prevents PII leakage in logs while preserving enough observability for debugging and cost tracking.
**Source:** 04-03-PLAN.md, 04-03-SUMMARY.md

---

## Lessons

### SDK Built-In Retry Conflicts with Custom Logic
The Anthropic SDK's `maxRetries` option is not merely a convenience wrapper — it applies its own classification and backoff that cannot be observed or overridden. Disabling it (`maxRetries: 0`) is the only clean way to gain full control.

**Context:** During Plan 02 implementation, the SDK's default retry behavior caused tests to make unexpected extra API calls, breaking deterministic mock assertions. Setting `maxRetries: 0` resolved this immediately.
**Source:** 04-02-SUMMARY.md

---

### Response Validation Has Three Distinct Failure Modes
Malformed API responses are not just "empty" — they surface as: (1) empty `content` array, (2) content blocks with no `text` type, (3) whitespace-only concatenated text. Each requires explicit handling.

**Context:** The initial plan only considered empty arrays. Reviewing Anthropic's content block format revealed image blocks and structured outputs that produce non-text blocks, expanding the validation scope.
**Source:** 04-02-PLAN.md

---

### Character-Count Heuristic Is Surprisingly Accurate for CJK
The `length / 4` heuristic was chosen pragmatically, but testing against real conversations showed it stays within ~20% of actual token counts for mixed Chinese/English chat. This is sufficient for truncation decisions.

**Context:** Real conversation history from UAT contained mixed CJK and English. The heuristic prevented runaway context while never over-truncating to the point of dropping useful history.
**Source:** 04-UAT.md

---

### Logging Error Codes Rather Than Messages Is Sufficient for Debugging
Initial concern that stripping raw error messages would hurt debugging proved unfounded. The `errorCode` + `conversationId` combination, plus SDK-level logging if needed, provides enough signal.

**Context:** Threat model T-4-07 mandated no raw error logging. In practice, the five error codes map cleanly to the root causes, and conversationId enables correlation with external API logs.
**Source:** 04-03-PLAN.md

---

## Patterns

### Error Classification Mapping Pattern
A single `classifyError(err)` method maps vendor-specific errors to three outputs: typed `errorCode`, `retryable` boolean, and localized `fallbackMessage`. This centralizes all error interpretation in one place.

**When to use:** Any adapter wrapping a third-party API with multiple error types. The pattern separates "what happened" (SDK error) from "what we do about it" (retry/fallback/classification).
**Source:** 04-02-PLAN.md

---

### Exponential Backoff with Configurable Jitter
`calculateDelay(attempt)` computes base delay from configurable base, multiplier, and attempt number, then applies optional random jitter. Jitter can be disabled for deterministic testing.

**When to use:** Any retry loop where thundering-herd is a risk and test determinism is required. Disabling jitter in tests makes mock timing assertions reliable.
**Source:** 04-02-PLAN.md

---

### Response Validation as Isolated Method
`validateResponse(response)` returns `{ valid, content }` rather than throwing. This keeps the main `chat()` flow linear and makes validation logic independently testable.

**When to use:** Any API adapter that receives complex or polymorphic responses. Isolating validation simplifies the main control flow and enables focused unit tests.
**Source:** 04-02-PLAN.md

---

### Non-Throwing Result Pattern
`ChatResult` returns `{ content, error?, errorCode?, usage? }` instead of throwing. Callers always get a usable string in `content` (either AI response or fallback), and optional metadata fields signal what happened.

**When to use:** Any service-layer API where the caller needs a guaranteed response string even on failure. Prevents try/catch cascades and ensures the user always sees something.
**Source:** 04-02-PLAN.md context (D-05)

---

## Surprises

### Zero Regressions Across 79 Tests
Despite touching the core AI adapter, config layer, and bot orchestrator, the full test suite (79 tests across 13 files) passed with zero modifications to existing test assertions.

**Impact:** Confirms that the ChatResult extension and adapter rewrite were truly backward-compatible. The only test changes were additive (new fields in test helpers, new test cases).
**Source:** 04-03-SUMMARY.md

---

### Real AI Model (Qwen via ModelScope) Validated End-to-End
UAT confirmed the retry and validation logic works against a real non-Anthropic API (Qwen/Qwen3.5-27B via ModelScope), not just mocks.

**Impact:** Validates that the error classification and retry logic is generic enough to work with OpenAI-compatible APIs beyond Anthropic's official SDK.
**Source:** 04-UAT.md

---

### Config Contract Foundation Simplified Downstream Implementation
Having all tunables defined in BotConfig with env var bindings and defaults (Plan 01) made the adapter implementation (Plan 02) purely mechanical — no design decisions remained.

**Impact:** Phase 04's three-plan wave structure (contracts → implementation → integration) proved effective. Each plan had zero open questions when execution started.
**Source:** 04-01-SUMMARY.md, 04-02-SUMMARY.md
