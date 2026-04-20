---
status: complete
phase: 04-ai-api-validation-reliability
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
started: "2026-04-20T00:00:00Z"
updated: "2026-04-20T12:10:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Build passes and full test suite passes with no errors
result: pass

### 1a. End-to-End: WeCom Message Reply
expected: |
  在企业微信端发送"测试"，bot 应在几秒内回复 AI 生成的响应。
result: pass
notes: |
  用户验证通过。日志确认完整链路：msg received → handleTextMessage →
  AI token usage {input_tokens: 43, output_tokens: 651} → reply sent via WebSocket.
  AI模型 Qwen/Qwen3.5-27B via ModelScope 正常调用。

### 2. Config Contracts Load New AI Retry Settings
expected: |
  New env vars are recognized: MAX_INPUT_TOKENS, MAX_RETRIES, RETRY_BASE_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER, RETRY_JITTER, FALLBACK_RETRYABLE_MSG, etc.
  Defaults apply when not set (maxInputTokens=8192, maxRetries=1, retryBaseDelayMs=2000).
  Invalid values produce descriptive errors.
result: pass
notes: "Verified by unit tests (src/config/index.test.ts) and code review."

### 3. AI Adapter Returns Structured ChatResult on Errors
expected: |
  When Anthropic API returns an error (rate limit, auth failure, timeout),
  the adapter returns a ChatResult with `error: true`, a descriptive
  `fallbackMessage`, and a structured `errorCode`. No uncaught exceptions.
result: pass
notes: "Verified by unit tests (src/ai/api-adapter.test.ts)."

### 4. AI Adapter Retries on Transient Failures
expected: |
  On 429, 5xx, or timeout errors, the adapter retries up to `maxRetries`
  times with exponential backoff and optional jitter.
result: pass
notes: "Verified by unit tests."

### 5. AI Adapter Fails Fast on Permanent Errors
expected: |
  On 400, 401, 403, 404, or 422 errors, the adapter does NOT retry and
  immediately returns a ChatResult with the appropriate `errorCode`.
result: pass
notes: "Verified by code review: classifyError() sets retryable=false for permanent errors."

### 6. Bot Orchestrator Logs AI Errors with Error Code
expected: |
  When the AI backend returns an error, BotOrchestrator logs a warning
  containing the `errorCode` but NEVER logs raw error objects.
result: pass
notes: "Verified by code review (src/bot/index.ts:96-106)."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
