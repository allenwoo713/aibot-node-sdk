---
phase: 02-http-fallback-transport
plan: 04
subsystem: testing
tags: [typescript, vitest, transport, wecom, http, websocket]

requires:
  - phase: 02-http-fallback-transport
    provides: HttpTransport, HttpCallback, FallbackTransport, WsTransport

provides:
  - Comprehensive unit tests for HttpTransport and TokenCache
  - Comprehensive unit tests for HTTP callback handler (signature, decryption, dedup)
  - Comprehensive unit tests for FallbackTransport routing and deduplication

affects:
  - 02-http-fallback-transport

tech-stack:
  added: []
  patterns:
    - Mocking network boundaries with vi.fn() while using real crypto for correctness
    - Testing concurrent behavior with Promise.all and delay mocks

key-files:
  created:
    - src/transport/http-transport.test.ts
    - src/transport/http-callback.test.ts
    - src/transport/fallback-transport.test.ts
  modified:
    - src/transport/http-transport.ts

key-decisions:
  - "Exported TokenCache from http-transport.ts to enable direct unit testing of refresh-lock behavior"
  - "Used real WecomCrypto instances in callback tests to verify end-to-end signature and encryption correctness"

patterns-established:
  - "Transport layer tests mock API client boundaries but exercise real crypto for callback verification"

requirements-completed:
  - TEST-02

# Metrics
duration: 8min
completed: 2026-04-15
---

# Phase 02 Plan 04: HTTP Fallback Transport Tests Summary

**Comprehensive unit and integration tests for HTTP fallback transport, token cache, callback handler, and fallback routing logic**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-15T13:37:00Z
- **Completed:** 2026-04-15T13:41:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created `src/transport/http-transport.test.ts` covering TokenCache concurrent fetch serialization, cached token reuse, 42001 retry logic, and sendStream buffering
- Created `src/transport/http-callback.test.ts` covering signature verification, stale timestamp rejection, payload decryption, duplicate msgid deduplication, and XML/JSON envelope parsing
- Created `src/transport/fallback-transport.test.ts` covering primary/fallback routing, cross-transport deduplication, and event forwarding
- Exported `TokenCache` from `http-transport.ts` to support direct unit testing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add HttpTransport and TokenCache unit tests** - `9284973` (test)
2. **Task 2: Add HTTP callback handler unit tests** - `7e03721` (test)
3. **Task 3: Add FallbackTransport unit tests** - `23203f9` (test)

## Files Created/Modified
- `src/transport/http-transport.test.ts` - TokenCache concurrency, HTTP sendText retry, sendStream buffering tests
- `src/transport/http-callback.test.ts` - Callback signature, timestamp, decryption, dedup, XML envelope tests
- `src/transport/fallback-transport.test.ts` - Fallback routing and cross-transport deduplication tests
- `src/transport/http-transport.ts` - Exported `TokenCache` class for testability

## Decisions Made
- Exported `TokenCache` from `http-transport.ts` so tests can directly assert refresh-lock behavior without relying on indirect behavior
- Used real `WecomCrypto` instances in callback tests rather than mocking crypto operations, ensuring correctness of signature verification and AES decryption logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial AES key in callback tests was invalid (29 bytes instead of 32). Fixed by generating a proper 43-character base64 key.
- `MessageHandler.handleFrame` emits both `message` and `message.text` events, so callback test assertions needed to account for 2 emits instead of 1.
- The module-level `seenMsgIds` Map in `http-callback.ts` persists across test calls, requiring unique msgids per test to avoid cross-test deduplication side effects.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All transport layer components have unit test coverage
- Existing bot tests continue to pass
- Phase 03 (Integration & E2E Validation) can build on this test foundation

## Self-Check: PASSED

- `src/transport/http-transport.test.ts` exists and passes
- `src/transport/http-callback.test.ts` exists and passes
- `src/transport/fallback-transport.test.ts` exists and passes
- `npx vitest run src/transport/` passes (14/14 tests)
- `npx vitest run src/bot/index.test.ts` passes (14/14 tests)
- `npx tsc --noEmit` passes

---
*Phase: 02-http-fallback-transport*
*Completed: 2026-04-15*
