---
phase: 4
plan: 01
name: "Config contracts and ChatResult extension"
status: completed
completed_at: "2026-04-19"
---

## Summary

Extended the type contracts and configuration layer to support retry policies, fallback messages, token limits, and structured error classification.

## Files Modified

- `src/ai/adapter.ts` — Added `errorCode` field to `ChatResult` with 5-value literal union
- `src/config/index.ts` — Added 10 new fields to `BotConfig` and `loadConfig()`
- `src/config/index.test.ts` — Added 2 test cases for defaults and overrides
- `.env.example` — Added "AI Retry & Cost Guard Settings" section

## Verification Results

- `npx tsc --noEmit` — passed (no compilation errors)
- `npx vitest run src/config/index.test.ts` — 7/7 tests passed

## Key Decisions Applied

- Error codes: `'retryable' | 'rate_limited' | 'auth_invalid' | 'validation_failed' | 'unknown'`
- Defaults: maxInputTokens=8192, maxRetries=1, retryBaseDelayMs=2000, retryBackoffMultiplier=2, retryJitter=true
- Fallback messages are in Chinese to match existing UX
