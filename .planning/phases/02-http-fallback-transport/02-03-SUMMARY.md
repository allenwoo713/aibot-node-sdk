---
phase: 02-http-fallback-transport
plan: 03
subsystem: transport
tags: [typescript, transport, bot, wecom, fallback]

requires:
  - phase: 02-http-fallback-transport
    provides: Transport abstraction, WsTransport, HttpTransport, FallbackTransport

provides:
  - Transport-agnostic BotOrchestrator with backward-compatible WsTransport default
  - FallbackTransport wired into bot entry point
  - SDK barrel exports for all transport classes and callback handler
  - Extended BotConfig with corpId and agentId fallbacks

affects:
  - 02-http-fallback-transport

tech-stack:
  added: []
  patterns:
    - Dependency injection via optional Transport constructor parameter
    - Adapter pattern preserving backward compatibility

key-files:
  created: []
  modified:
    - src/bot/index.ts
    - src/bot/index.test.ts
    - src/config/index.ts
    - src/bot/entry.ts
    - src/index.ts
    - .env.example

key-decisions:
  - "BotOrchestrator defaults to WsTransport when no transport is injected, preserving backward compatibility"
  - "sendText now routes through Transport.sendText instead of generating a one-shot stream ID internally"
  - "CORP_ID and AGENT_ID fall back to BOT_ID to minimize required configuration changes"

patterns-established:
  - "Optional dependency injection: core classes accept abstractions but default to the legacy implementation"

requirements-completed:
  - COMPAT-03

# Metrics
duration: 6min
completed: 2026-04-15
---

# Phase 02 Plan 03: Bot and SDK Integration Summary

**Transport-agnostic BotOrchestrator with backward-compatible WsTransport default, FallbackTransport wired in entry point, and extended SDK exports**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-15T13:34:00Z
- **Completed:** 2026-04-15T13:35:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Refactored `BotOrchestrator` to accept an optional `Transport` injection and default to `WsTransport`
- Replaced all `wsClient.replyStream` calls with `transport.sendText` and `transport.sendStream`
- Updated bot tests to mock `../transport` and assert transport methods instead of `WSClient`
- Wired `FallbackTransport` (WS primary + HTTP fallback) into `src/bot/entry.ts`
- Exported `Transport`, `WsTransport`, `HttpTransport`, `FallbackTransport`, `handleCallback`, and callback types from `src/index.ts`
- Extended `BotConfig` with `corpId` and `agentId` (fallback to `BOT_ID`) and documented them in `.env.example`

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor BotOrchestrator to accept Transport** - `df65d10` (feat)
2. **Task 2: Wire FallbackTransport in entry point and update SDK exports** - `eda35f5` (feat)

## Files Created/Modified
- `src/bot/index.ts` - `BotOrchestrator` now depends on `Transport` interface, defaults to `WsTransport`
- `src/bot/index.test.ts` - Mocked `../transport` instead of `WSClient`; updated assertions for `sendText`/`sendStream`
- `src/config/index.ts` - Added `corpId` and `agentId` fields with fallback to `BOT_ID`
- `src/bot/entry.ts` - Instantiates `FallbackTransport` with `WsTransport` primary and `HttpTransport` fallback
- `src/index.ts` - Added named exports for transport classes, types, and `handleCallback`
- `.env.example` - Added `CORP_ID` and `AGENT_ID` documentation

## Decisions Made
- Followed plan exactly: optional `Transport` injection preserves backward compatibility for existing SDK consumers
- `sendText` delegates to `Transport.sendText`, which simplifies the bot's reply logic and removes internal stream ID generation for plain text replies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertions for sendText vs sendStream**
- **Found during:** Task 1 (BotOrchestrator test updates)
- **Issue:** After refactoring `sendText` to call `transport.sendText` instead of `transport.sendStream`, two tests continued to assert `sendStream` calls, causing failures
- **Fix:** Updated the "sends fallback when AI returns an error" and "rate limits excess requests per conversation" tests to assert `transport.sendText` calls
- **Files modified:** `src/bot/index.test.ts`
- **Verification:** `npx vitest run src/bot/index.test.ts` passes with 7/7 tests
- **Committed in:** `df65d10` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test alignment fix; no scope creep or design changes.

## Issues Encountered
- Bot tests failed initially because `sendText` now uses `transport.sendText` instead of `sendStream`; quickly resolved by updating test assertions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bot orchestrator is fully transport-agnostic and ready for HTTP fallback at runtime
- SDK consumers can import `FallbackTransport`, `HttpTransport`, and `handleCallback` directly
- Phase 03 (Integration & E2E Validation) can now test end-to-end fallback behavior

## Self-Check: PASSED

- `src/bot/index.ts` exists and compiles
- `src/bot/index.test.ts` passes (`npx vitest run src/bot/index.test.ts`)
- `src/config/index.ts` exists and compiles
- `src/bot/entry.ts` exists and compiles
- `src/index.ts` exists and compiles
- `.env.example` exists
- TypeScript compilation passes (`npx tsc --noEmit`)

---
*Phase: 02-http-fallback-transport*
*Completed: 2026-04-15*
