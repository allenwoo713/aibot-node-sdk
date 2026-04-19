---
phase: 4
plan: 02
name: "Core adapter implementation — retry, validation, classification, truncation"
status: completed
completed_at: "2026-04-19"
---

## Summary

Rewrote AnthropicApiAdapter with configurable retry logic, response validation, structured error classification, token tracking, and input truncation.

## Files Modified

- `src/ai/api-adapter.ts` — Full rewrite with retry loop, error classification, response validation, token truncation
- `src/ai/api-adapter.test.ts` — Expanded from 7 to 22 test cases covering validation, retry, classification, truncation

## Verification Results

- `npx tsc --noEmit` — passed (no compilation errors)
- `npx vitest run src/ai/api-adapter.test.ts` — 22/22 tests passed

## Key Behaviors Implemented

- **SDK built-in retry disabled** (`maxRetries: 0`) to avoid double retry layers
- **Custom retry loop** retries on 429, 5xx, timeout errors up to configurable `maxRetries`
- **Fail-fast** on 400, 401, 403, 404, 422 without retry
- **Exponential backoff with optional jitter** via `calculateDelay(attempt)`
- **Response validation** catches empty content, missing text blocks, whitespace-only text
- **Structured error classification** maps each error to correct `errorCode` and configurable fallback message
- **Token truncation** drops oldest messages when character-count heuristic exceeds `maxInputTokens`
- **Current user message never dropped** during truncation
