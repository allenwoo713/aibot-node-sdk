# Phase 4: AI API Validation & Reliability - Research

**Researched:** 2026-04-17
**Domain:** TypeScript SDK, Anthropic Claude API, retry logic, response validation, token management
**Confidence:** HIGH

## Summary

Phase 4 strengthens the `AnthropicApiAdapter` with configurable retry policies, structured error classification, response validation, token tracking, and input truncation. The current implementation has hardcoded retry (1 attempt on 5xx/429), swallows all errors into a single Chinese fallback message, and does not validate response content blocks. The Anthropic SDK (`@anthropic-ai/sdk` ^0.88.0) already provides built-in retry with exponential backoff (default `maxRetries: 2`), but the project currently bypasses it with a custom `callWithRetry` method. The phase must reconcile the SDK's built-in retry with user-configurable parameters while preserving the `ChatResult` error-swallowing contract decided in CONTEXT.md.

**Primary recommendation:** Replace the custom `callWithRetry` with SDK-level retry configuration (disabling SDK retries and implementing custom retry in the adapter, OR configuring SDK retries and adding a classification layer on top). Given the need for per-error-type fallback messages and structured classification, the cleaner approach is to **disable SDK retries** (`maxRetries: 0`) and implement a fully custom retry loop in `AnthropicApiAdapter` where we catch specific `Anthropic.*Error` types, classify them, apply configurable backoff, and map to per-error-type fallback messages.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Retry logic with backoff | API/Backend | — | Belongs in `AnthropicApiAdapter`, the boundary with the external AI API |
| Error classification | API/Backend | — | Derived from HTTP status codes and SDK error types; adapter responsibility |
| Response validation | API/Backend | — | Validates `Message.content` array before returning to `BotOrchestrator` |
| Token tracking | API/Backend | — | Extracts `usage` from `Message` response; adapter responsibility |
| Input truncation | API/Backend | — | Pre-truncates `messages` array before API call to respect `maxInputTokens` |
| Configurable policy | API/Backend (config layer) | — | `BotConfig` fields loaded from `process.env` via `loadConfig()` |
| Fallback messaging | API/Backend | — | Maps classified errors to configurable fallback strings |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** When conversation history exceeds `maxInputTokens`, **truncate the oldest messages** to fit within the limit. Keep the most recent messages and the current user message.
- **D-02:** Conversation compaction / summarization when over the limit is **deferred** to a future enhancement (not in this phase).
- **D-03:** Default retry policy is **conservative — 1 retry** on retryable errors (5xx and 429), matching the current behavior.
- **D-04:** Retry parameters (`maxRetries`, `baseDelayMs`, `backoffMultiplier`, `jitter`) must be **configurable via `BotConfig`** with sensible defaults.
- **D-05:** Keep the **existing `ChatResult` pattern**: the adapter returns `{ content, error: true, usage?, errorCode? }` rather than throwing structured errors.
- **D-06:** Introduce **structured error classification** (`retryable`, `rate_limited`, `auth_invalid`, `unknown`) inside `ChatResult` so operators can observe failures without changing the top-level interface contract.
- **D-07:** Throwing typed errors (e.g. `AiRateLimitError`) from `AiBackend` is **deferred** to a future interface evolution.
- **D-08:** Fallback messages for AI failures must be **configurable per error type** in `BotConfig` (e.g. separate messages for rate limit, auth invalid, validation failure, generic retryable).
- **D-09:** If a specific fallback message is not configured, fall back to a sensible default (can keep the current hardcoded Chinese message as the ultimate default).
- **D-10:** A response is considered "malformed or empty" when: (a) the API returns an empty `content` array, (b) no text-type content blocks are present, or (c) the concatenated text is empty/whitespace-only. In these cases, return a validated fallback response with `error: true`.

### Claude's Discretion
- Exact truncation strategy (e.g. drop oldest N messages vs. sliding window) can be decided at implementation time as long as `maxInputTokens` is respected.
- Jitter implementation (fixed vs. random) is left to planner/executor discretion.

### Deferred Ideas (OUT OF SCOPE)
- **Conversation compaction/summarization** when token limit is exceeded — belongs in a future AI optimization phase.
- **Throwing structured errors from `AiBackend`** — a future interface evolution when the SDK is ready for a breaking change or v2 interface.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIAPI-01 | User receives a validated AI response even when the upstream API returns malformed or empty content blocks | Response validation pattern (D-10) + `Message.content` array inspection [VERIFIED: SDK source] |
| AIAPI-02 | User can configure retry policy (maxRetries, base delay, backoff multiplier, jitter) via `BotConfig` | `BotConfig` extension + `getEnvInt()` pattern [VERIFIED: codebase] |
| AIAPI-03 | Retry logic only retries retryable errors (429, 5xx, timeout) and fails fast on non-retryable errors (400, 401, 403, 404, 422) | SDK error type mapping to status codes [VERIFIED: SDK source `core/error.ts`] |
| AIAPI-04 | SDK surfaces structured error classification (retryable, rate_limited, auth_invalid, unknown) for operator observability | `ChatResult` extension with `errorCode?` field [VERIFIED: codebase] |
| AIAPI-05 | Token usage is tracked and forwarded in `ChatResult` when the API returns it | `Message.usage` field exists and is already partially extracted [VERIFIED: SDK source `messages.ts`] |
| AIAPI-06 | Input payloads exceeding `maxInputTokens` are rejected or truncated before the API call to prevent runaway costs | Truncate oldest messages strategy (D-01) + optional `messages.countTokens()` [CITED: Context7 docs] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.88.0 (installed), 0.90.0 (latest) | Claude API client | Already the project's AI backend; provides typed errors, `Message.usage`, `countTokens()` [VERIFIED: npm registry] |
| `vitest` | ^4.1.2 (installed), 4.1.4 (latest) | Unit/E2E test runner | Already in use; supports `vi.fn()` mocking used in existing tests [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `crypto` | built-in | Jitter randomness | Already available; no extra dependency needed for `Math.random()`-based jitter |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom retry loop | SDK built-in `maxRetries` | SDK retry does not support per-error-type fallback messages or classification. Disabling SDK retry and doing custom gives full control at small code cost. |
| `messages.countTokens()` | Character-count heuristic | `countTokens()` requires an extra API call (latency + cost). Character heuristic is fast but inaccurate. For truncation, a heuristic may be acceptable. |

**Version verification:**
```bash
npm view @anthropic-ai/sdk version  # 0.90.0 (project uses 0.88.0)
npm view vitest version              # 4.1.4 (project uses 4.1.2)
```

## Architecture Patterns

### System Architecture Diagram

```
BotOrchestrator.handleTextMessage()
         |
         v
+----------------------------+
|  ConversationStore.build   |
|  Messages()                |
+----------------------------+
         |
         v
+----------------------------+
|  AnthropicApiAdapter.chat  |
|  (options: ChatOptions)    |
+----------------------------+
         |
    +----+----+
    |         |
    v         v
Truncate   Validate
oldest     ChatOptions
messages   (maxInputTokens)
    |         |
    +----+----+
         |
         v
+----------------------------+
|  callWithRetry()           |
|  - configurable maxRetries |
|  - exponential backoff     |
|  - jitter                  |
+----------------------------+
         |
    +----+----+
    |         |
    v         v
 SDK call   Catch error
    |         |
    v         v
Validate   Classify error
response   (retryable, rate_limited,
content    auth_invalid, unknown)
    |         |
    +----+----+
         |
    +----+----+
    |         |
    v         v
 Success   Exhausted retries
    |         |
    v         v
Return     Map to per-error-type
ChatResult fallback message
{content,   Return ChatResult
 usage}     {content, error: true,
            errorCode}
```

### Recommended Project Structure

No new directories needed. Changes are confined to existing files:

```
src/
├── ai/
│   ├── adapter.ts          # Extend ChatResult with errorCode
│   ├── api-adapter.ts      # Main implementation target
│   └── api-adapter.test.ts # Extend existing tests
├── config/
│   ├── index.ts            # Add retry/fallback config fields
│   └── index.test.ts       # Add config tests
├── bot/
│   ├── index.ts            # May need to forward errorCode
│   └── index.test.ts       # Update bot tests
└── types/
    └── common.ts           # Optional: add AiErrorCode enum
```

### Pattern 1: Configurable Retry with Exponential Backoff and Jitter

**What:** A retry loop that sleeps for `baseDelayMs * backoffMultiplier^attempt * jitter` between attempts, only retrying on retryable errors.

**When to use:** All external API calls where transient failures are expected.

**Example:**
```typescript
// Source: Anthropic SDK client.ts (adapted for custom control)
private async callWithRetry(
  systemPrompt: string,
  messages: Anthropic.Messages.MessageParam[],
  attempt = 0,
): Promise<Anthropic.Messages.Message> {
  try {
    return await this.client.messages.create(
      { model: this.model, max_tokens: this.maxOutputTokens, system: systemPrompt, messages },
      { timeout: this.timeoutMs, maxRetries: 0 }, // disable SDK retry
    );
  } catch (err: any) {
    const classification = classifyError(err);
    if (classification.retryable && attempt < this.maxRetries) {
      const delayMs = this.calculateDelay(attempt);
      await sleep(delayMs);
      return this.callWithRetry(systemPrompt, messages, attempt + 1);
    }
    throw err; // caught by outer try/catch in chat()
  }
}

private calculateDelay(attempt: number): number {
  const base = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
  const jitter = 1 - Math.random() * this.retryConfig.jitter;
  return Math.min(base * jitter, this.retryConfig.maxDelayMs ?? 60000);
}
```

### Pattern 2: Error Classification Using SDK Error Types

**What:** Map `Anthropic.*Error` instances (and generic errors) to a structured classification object.

**When to use:** When you need to distinguish retryable vs. fatal errors and provide operator observability.

**Example:**
```typescript
// Source: Anthropic SDK core/error.ts [VERIFIED: installed package]
import Anthropic from '@anthropic-ai/sdk';

type ErrorClassification = {
  retryable: boolean;
  errorCode: 'retryable' | 'rate_limited' | 'auth_invalid' | 'unknown';
};

function classifyError(err: unknown): ErrorClassification {
  if (err instanceof Anthropic.RateLimitError) {
    return { retryable: true, errorCode: 'rate_limited' };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { retryable: false, errorCode: 'auth_invalid' };
  }
  if (err instanceof Anthropic.BadRequestError ||
      err instanceof Anthropic.PermissionDeniedError ||
      err instanceof Anthropic.NotFoundError ||
      err instanceof Anthropic.UnprocessableEntityError) {
    return { retryable: false, errorCode: 'unknown' };
  }
  if (err instanceof Anthropic.APIError) {
    // 5xx, 408, 409, or other unhandled status
    const status = err.status ?? 0;
    return { retryable: status >= 500 || status === 408 || status === 409, errorCode: 'retryable' };
  }
  // Network/timeout errors without status
  return { retryable: true, errorCode: 'retryable' };
}
```

### Pattern 3: Response Validation for Malformed Content

**What:** After a successful API call, validate that the response contains at least one text content block with non-empty text.

**When to use:** Before returning `ChatResult` to the caller.

**Example:**
```typescript
// Source: adapted from existing api-adapter.ts + D-10 decision
function validateResponse(response: Anthropic.Messages.Message): { valid: true } | { valid: false; reason: string } {
  if (!response.content || response.content.length === 0) {
    return { valid: false, reason: 'empty_content_array' };
  }
  const textBlocks = response.content.filter((c) => c.type === 'text');
  if (textBlocks.length === 0) {
    return { valid: false, reason: 'no_text_blocks' };
  }
  const text = textBlocks.map((c) => c.text).join('');
  if (!text.trim()) {
    return { valid: false, reason: 'whitespace_only' };
  }
  return { valid: true };
}
```

### Pattern 4: Input Truncation Before API Call

**What:** If the total input token count (or a heuristic) exceeds `maxInputTokens`, drop the oldest messages until the count is under the limit, always preserving the current user message.

**When to use:** Before calling `messages.create()` to prevent API rejection and runaway costs.

**Example:**
```typescript
// Source: D-01 decision + Context7 countTokens docs [CITED: Context7]
private async truncateMessages(
  messages: Anthropic.Messages.MessageParam[],
  systemPrompt: string,
): Promise<Anthropic.Messages.MessageParam[]> {
  // Option A: Use countTokens API (accurate but adds latency/cost)
  // Option B: Character heuristic (fast but approximate)
  // Decision: implement heuristic first; countTokens optional enhancement

  const estimateTokens = (text: string) => Math.ceil(text.length / 4); // rough heuristic

  let total = estimateTokens(systemPrompt);
  for (const m of messages) {
    total += estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
  }

  if (total <= this.maxInputTokens) return messages;

  // Drop oldest messages (from the front), but keep the last user message
  let trimmed = [...messages];
  while (trimmed.length > 1 && total > this.maxInputTokens) {
    const removed = trimmed.shift()!;
    total -= estimateTokens(typeof removed.content === 'string' ? removed.content : JSON.stringify(removed.content));
  }
  return trimmed;
}
```

### Anti-Patterns to Avoid

- **Double retry layers:** Do not enable SDK `maxRetries > 0` AND implement a custom retry loop. This causes multiplicative retry behavior (e.g., 2 SDK retries * 3 custom retries = up to 9 attempts). [VERIFIED: SDK source `client.ts`]
- **Catching all errors as `unknown` without `instanceof`:** The SDK exports typed errors. Use `instanceof Anthropic.RateLimitError` rather than parsing `err.status` on untyped objects.
- **Truncating without preserving the user message:** If truncation removes the current user message, the API call becomes meaningless. Always ensure the final message in the array is the current user message.
- **Using `countTokens()` synchronously in the hot path:** `countTokens()` is async and adds an API round-trip. For high-throughput bots, use a heuristic or cache token counts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP status error classification | Manual status code parsing | `instanceof Anthropic.*Error` | SDK already maps status codes to typed errors [VERIFIED: SDK `core/error.ts`] |
| Exponential backoff with jitter | Custom `setTimeout` math | Adapt SDK's formula: `0.5 * 2^attempt * (1 - random*0.25)` | SDK uses this proven pattern; copy and parameterize it [VERIFIED: SDK `client.ts`] |
| Token counting | Character-count heuristic (if accuracy critical) | `client.messages.countTokens()` | Anthropic provides official token counting endpoint [CITED: Context7 docs] |

**Key insight:** The Anthropic SDK already has sophisticated retry, error typing, and token tracking. The phase's value is in **exposing control** (configurability, classification, fallback messages) rather than rebuilding the underlying mechanics.

## Runtime State Inventory

This phase is a code/config enhancement, not a rename/refactor/migration. No runtime state inventory required.

**Step 2.5: SKIPPED** (not a rename/refactor/migration phase)

## Common Pitfalls

### Pitfall 1: SDK Built-in Retry Conflicts with Custom Retry
**What goes wrong:** If the SDK is configured with `maxRetries: 2` (default) and the adapter also retries, a single 429 could trigger 2 SDK retries * 2 adapter retries = 4 total attempts, with delays that compound unpredictably.
**Why it happens:** The SDK's `shouldRetry` retries on 408, 409, 429, and >=500. The adapter's `callWithRetry` also retries on 5xx/429.
**How to avoid:** Explicitly pass `maxRetries: 0` to `client.messages.create()` (or set `maxRetries: 0` on the client constructor) when using a custom retry loop.
**Warning signs:** Test timeouts exceeding expected durations; `createMock` called more times than `maxRetries + 1`.

### Pitfall 2: `ChatResult` Interface Change Breaks BotOrchestrator
**What goes wrong:** Adding `errorCode` to `ChatResult` without updating `BotOrchestrator` causes TypeScript errors or runtime undefined behavior.
**Why it happens:** `BotOrchestrator.handleTextMessage()` destructures `result.error` and `result.content` but may not handle `result.errorCode`.
**How to avoid:** The `errorCode` field is optional per D-05/D-06. Ensure it is typed as optional and that `BotOrchestrator` compiles without changes (it should, since it only checks `result.error`).
**Warning signs:** TypeScript compilation failure in `src/bot/index.ts`.

### Pitfall 3: Truncation Removes the Current User Message
**What goes wrong:** If `buildMessages()` appends the current user message at the end, and truncation drops from the front, the user message is preserved. But if the logic changes (e.g., dropping from the back), the user message could be lost.
**Why it happens:** `ConversationStore.buildMessages()` adds `incomingUserMessage` at the end. The adapter's truncation must respect this ordering.
**How to avoid:** Truncate by dropping from the front (oldest messages) and stop if only the last message remains.
**Warning signs:** API returns responses that don't address the user's latest question.

### Pitfall 4: `usage` Field Missing on Cached or Edge Responses
**What goes wrong:** The Anthropic API documentation notes that `usage` is always present on non-streaming responses, but some proxy providers or cached responses may omit it.
**Why it happens:** Third-party API proxies or future SDK versions may change `usage` presence.
**How to avoid:** Always check `response.usage ? { input_tokens: response.usage.input_tokens, ... } : undefined` (the current code already does this).
**Warning signs:** `TypeError: Cannot read property 'input_tokens' of undefined`.

### Pitfall 5: Test Flakiness from `Math.random()` in Jitter
**What goes wrong:** Tests that assert exact delay values become flaky when jitter introduces randomness.
**Why it happens:** `calculateDelay` uses `Math.random()`.
**How to avoid:** Inject a `jitter` function or seedable random generator in tests, OR test that delay falls within a range rather than an exact value.
**Warning signs:** Intermittent test failures in CI.

## Code Examples

### Verified patterns from official sources:

#### Catching SDK Errors with `instanceof`
```typescript
// Source: Anthropic SDK docs via Context7 [CITED: context7.com/anthropics/anthropic-sdk-typescript]
import Anthropic from '@anthropic-ai/sdk';

try {
  const message = await client.messages.create({...});
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    console.log('Status:', error.status);
    if (error instanceof Anthropic.RateLimitError) {
      // 429
    } else if (error instanceof Anthropic.AuthenticationError) {
      // 401
    } else if (error instanceof Anthropic.BadRequestError) {
      // 400
    }
  }
}
```

#### Token Counting via API
```typescript
// Source: Anthropic SDK docs via Context7 [CITED: context7.com/anthropics/anthropic-sdk-typescript]
const result = await client.messages.countTokens({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello, how are you today?' }],
});
console.log('Token count:', result.input_tokens);
```

#### SDK Retry Configuration
```typescript
// Source: Anthropic SDK client.ts [VERIFIED: installed package]
const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  maxRetries: 0, // disable built-in retry
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded 1 retry with fixed delays (2000ms/10000ms) | Configurable retry with exponential backoff and jitter | This phase | Better handling of transient failures; operator tunability |
| Single generic fallback message | Per-error-type configurable fallback messages | This phase | Better UX for different failure modes |
| No response validation | Explicit validation of `content` array and text blocks | This phase | Prevents empty/malformed responses reaching users |
| No error classification | Structured `errorCode` in `ChatResult` | This phase | Enables observability and alerting |
| No token limit enforcement | Truncate oldest messages when exceeding `maxInputTokens` | This phase | Prevents runaway API costs |

**Deprecated/outdated:**
- The current `callWithRetry` with hardcoded `attempt < 1` and fixed delays: replaced by configurable policy.
- The single Chinese fallback `服务暂时繁忙，请稍后再试。`: becomes the ultimate default, with per-error-type overrides.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Anthropic.Messages.Message.content` is always an array (may be empty but never undefined) | Response Validation | If `content` can be undefined, the validation code needs an extra null check |
| A2 | `Message.usage` is always present on non-streaming `messages.create()` responses | Token Tracking | If absent, `usage` will be `undefined` which is already handled gracefully |
| A3 | Character-count heuristic (`length / 4`) is "good enough" for truncation decisions in this phase | Input Truncation | If too inaccurate, may still exceed token limits or over-truncate; `countTokens()` is the fallback enhancement |
| A4 | The project will not upgrade `@anthropic-ai/sdk` to 0.90.0 during this phase | Error Types | If upgraded, error type names and behavior should remain compatible (minor version bump) |

## Open Questions (RESOLVED)

1. **Should `maxInputTokens` be a new `BotConfig` field, or reuse `maxOutputTokens`?** ✅ RESOLVED
   - Decision: Add a new `maxInputTokens` config field with default 8192. Plans 04-01 and 04-02 implement this.

2. **Should truncation use `countTokens()` API or a heuristic?** ✅ RESOLVED
   - Decision: Use character-count heuristic (`length / 4`) for v1.1. `countTokens()` documented as future enhancement.

3. **How should `errorCode` be typed — string union or enum?** ✅ RESOLVED
   - Decision: Use string union `'retryable' | 'rate_limited' | 'auth_invalid' | 'validation_failed' | 'unknown'` for consistency. Plan 04-01 implements this in `src/ai/adapter.ts`.

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies identified; all tools already present in project)

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.14.0 | — |
| `@anthropic-ai/sdk` | AI API calls | Yes | 0.88.0 | — |
| vitest | Testing | Yes | 4.1.2 | — |

## Validation Architecture

> `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is included for informational purposes but is not enforced by the workflow.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 |
| Config file | none (uses defaults) |
| Quick run command | `npx vitest run src/ai/api-adapter.test.ts` |
| Full suite command | `npm test` (=`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIAPI-01 | Returns fallback on empty/malformed content | unit | `npx vitest run src/ai/api-adapter.test.ts` | Yes |
| AIAPI-02 | Configurable retry policy respected | unit | `npx vitest run src/ai/api-adapter.test.ts` | Yes |
| AIAPI-03 | Only retryable errors trigger retry | unit | `npx vitest run src/ai/api-adapter.test.ts` | Yes |
| AIAPI-04 | Error classification present in ChatResult | unit | `npx vitest run src/ai/api-adapter.test.ts` | Yes |
| AIAPI-05 | Token usage forwarded in ChatResult | unit | `npx vitest run src/ai/api-adapter.test.ts` | Yes |
| AIAPI-06 | Input truncation respects maxInputTokens | unit | `npx vitest run src/ai/api-adapter.test.ts` | Yes (new tests needed) |

### Wave 0 Gaps
- [ ] `src/ai/api-adapter.test.ts` — needs new test cases for: response validation (empty content, no text blocks, whitespace), error classification (per error type), configurable retry (custom maxRetries/backoff), truncation behavior
- [ ] `src/config/index.test.ts` — needs tests for new config fields (retry policy, fallback messages, maxInputTokens)
- [ ] `src/bot/index.test.ts` — may need updates if `BotOrchestrator` behavior changes (e.g., forwarding `errorCode`)

## Security Domain

> `security_enforcement` is not explicitly disabled in config. Included for completeness.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | API key handled by SDK, not this phase |
| V3 Session Management | No | No sessions in AI adapter |
| V4 Access Control | No | No access control changes |
| V5 Input Validation | Yes | Validate `ChatOptions.history` length and content; truncate to prevent oversized payloads |
| V6 Cryptography | No | No crypto in this phase |
| V7 Error Handling | Yes | Do not leak API keys or internal details in fallback messages; classify errors without exposing internals |

### Known Threat Patterns for Anthropic SDK

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in logs | Information Disclosure | SDK does not log keys; ensure custom logger doesn't log `BotConfig` |
| Prompt injection via user message | Tampering | Out of scope (OOS-04); rely on Anthropic safety filters |
| Denial of wallet via oversized requests | Denial of Service | Truncate messages before API call (AIAPI-06) |
| Retry storm amplifying outages | Denial of Service | Cap `maxRetries` at a reasonable default (D-03: 1); configurable but bounded |

## Sources

### Primary (HIGH confidence)
- `node_modules/@anthropic-ai/sdk/src/core/error.ts` — SDK error class hierarchy and status code mapping [VERIFIED: installed package]
- `node_modules/@anthropic-ai/sdk/src/client.ts` — SDK built-in retry logic, `shouldRetry`, `calculateDefaultRetryTimeoutMillis` [VERIFIED: installed package]
- `node_modules/@anthropic-ai/sdk/src/resources/messages/messages.ts` — `Message` interface, `Usage` interface, `content` and `usage` fields [VERIFIED: installed package]
- `node_modules/@anthropic-ai/sdk/src/index.ts` — Exported error types [VERIFIED: installed package]
- Context7 `/anthropics/anthropic-sdk-typescript` — Error handling patterns, token counting API [CITED: context7.com]

### Secondary (MEDIUM confidence)
- Anthropic official docs (platform.claude.com) — HTTP error codes and retry-after headers [CITED: platform.claude.com/docs/en/api/errors]
- Project codebase — `src/ai/api-adapter.ts`, `src/ai/adapter.ts`, `src/config/index.ts`, `src/bot/index.ts` [VERIFIED: codebase]

### Tertiary (LOW confidence)
- None — all critical claims verified against installed SDK source or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and verified against source
- Architecture: HIGH — codebase patterns well understood; changes are additive
- Pitfalls: HIGH — SDK retry behavior fully traced from source

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (Anthropic SDK moves fast; verify before execution if SDK is upgraded)
