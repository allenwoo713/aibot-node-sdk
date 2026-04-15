---
phase: 03-integration-e2e-validation
plan: 01
subsystem: testing
tags: [vitest, e2e, websocket, http-callback, wecom-crypto, eventemitter3]

requires:
  - phase: 01-async-persistence-refactor
    provides: Async ConversationStore with buildMessages and append
  - phase: 02-http-fallback-transport
    provides: WsTransport, HttpTransport, FallbackTransport, handleCallback

provides:
  - Multi-turn WebSocket E2E proving conversation history continuity
  - HTTP callback E2E with real Node.js server and WecomCrypto signatures
  - Entry point smoke test validating full stack instantiation
  - Fallback transport E2E proving WS-to-HTTP reply routing on disconnect

affects:
  - 03-integration-e2e-validation

tech-stack:
  added: []
  patterns:
    - "E2E tests mock external APIs (Anthropic, WeCom) and exercise real transport/crypto layers"
    - "Smoke tests dynamically import entry modules to verify wiring without side effects"

key-files:
  created:
    - __tests__/bot.http.e2e.test.ts
    - __tests__/bot.entry.smoke.test.ts
    - __tests__/bot.fallback.e2e.test.ts
  modified:
    - __tests__/bot.e2e.test.ts
    - src/bot/index.ts
    - src/bot/entry.ts
    - src/memory.ts

key-decisions:
  - "Exported bot instance from entry.ts to enable dynamic import smoke testing"
  - "Made ConversationStore.buildMessages incomingUserMessage optional to avoid duplicate user entries when caller already appended the message"

patterns-established:
  - "Mock AI adapter and API client in E2E tests while using real transport and crypto implementations"
  - "Use local http.createServer bound to 127.0.0.1:0 for HTTP callback E2E validation"

requirements-completed:
  - TEST-03

duration: 15min
completed: "2026-04-15"
---

# Phase 03 Plan 01: Integration and E2E Validation Summary

**Four end-to-end and smoke tests proving BotOrchestrator works across WebSocket and HTTP transports with real crypto and conversation history**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-15T15:51:00Z
- **Completed:** 2026-04-15T16:06:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Extended WebSocket E2E with multi-turn conversation test asserting history continuity
- Created HTTP callback E2E using a real Node.js HTTP server, valid WeCom crypto signatures, and encrypted payloads
- Added entry smoke test that dynamically imports `src/bot/entry.ts` and verifies full-stack instantiation
- Created fallback transport E2E proving reply routing switches from WS to HTTP after disconnect
- Full test suite passes: 61/61 tests with zero failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend WebSocket E2E with multi-turn conversation** - `d84e679` (test)
2. **Task 2: Create HTTP callback E2E with real Node.js server and WecomCrypto** - `bc7f7f8` (test)
3. **Task 3: Create entry smoke test and fallback transport E2E** - `1add209` (test)

## Files Created/Modified
- `__tests__/bot.e2e.test.ts` - Added multi-turn conversation test with history assertion
- `__tests__/bot.http.e2e.test.ts` - New HTTP callback E2E with real server and WecomCrypto
- `__tests__/bot.entry.smoke.test.ts` - New entry point smoke test
- `__tests__/bot.fallback.e2e.test.ts` - New fallback transport routing E2E
- `src/bot/index.ts` - Fixed user message persistence for history continuity
- `src/bot/entry.ts` - Exported bot instance for testability
- `src/memory.ts` - Made `buildMessages` `incomingUserMessage` parameter optional

## Decisions Made
- Exported `bot` from `entry.ts` so the smoke test can dynamically import and assert on the instantiated stack
- Made `ConversationStore.buildMessages` accept an optional `incomingUserMessage` to prevent duplicate user entries when `BotOrchestrator` already appends the user message to the store

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing user message persistence in BotOrchestrator**
- **Found during:** Task 1 (multi-turn WebSocket E2E)
- **Issue:** `BotOrchestrator.handleTextMessage` never appended the incoming user message to `ConversationStore`, so multi-turn history only contained assistant replies
- **Fix:** Added `await this.store.append(conversationId, { role: 'user', content })` before building messages; made `buildMessages` `incomingUserMessage` optional to avoid duplicates
- **Files modified:** `src/bot/index.ts`, `src/memory.ts`
- **Verification:** Multi-turn E2E test passes; `memory.test.ts` and `bot/index.test.ts` still pass
- **Committed in:** `d84e679` (Task 1 commit)

**2. [Rule 3 - Blocking] Added missing `from` and `chattype` fields to HTTP callback E2E payload**
- **Found during:** Task 2 (HTTP callback E2E)
- **Issue:** The encrypted callback payload only contained `msgid`, `msgtype`, and `text`, causing `BotOrchestrator.shouldReply` to return `false` because `chattype` and `from.userid` were missing
- **Fix:** Enriched `createEncryptedPayload` to include `chattype: 'single'`, `aibotid`, and `from: { userid: 'user-http' }`
- **Files modified:** `__tests__/bot.http.e2e.test.ts`
- **Verification:** HTTP callback E2E test passes, `chatMock` called once, `sendText` spy verified
- **Committed in:** `bc7f7f8` (Task 2 commit)

**3. [Rule 3 - Blocking] Exported `bot` from `src/bot/entry.ts` for smoke test**
- **Found during:** Task 3 (entry smoke test)
- **Issue:** `entry.ts` did not export the `bot` instance, so `const { bot } = await import('../src/bot/entry')` returned `undefined`
- **Fix:** Changed `const bot = ...` to `export const bot = ...`
- **Files modified:** `src/bot/entry.ts`
- **Verification:** Entry smoke test passes
- **Committed in:** `1add209` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes were correctness requirements. No scope creep.

## Issues Encountered
- `HttpTransport.sendText` is a real async method, not a mock, so the HTTP E2E test needed `vi.spyOn` setup before the request and assertion after awaiting the bot handler

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All E2E and smoke tests are green
- Phase 3 integration and E2E validation is complete
- No blockers for milestone completion

## Self-Check: PASSED
- Created files exist: `__tests__/bot.http.e2e.test.ts`, `__tests__/bot.entry.smoke.test.ts`, `__tests__/bot.fallback.e2e.test.ts`
- Commits verified: `d84e679`, `bc7f7f8`, `1add209`

---
*Phase: 03-integration-e2e-validation*
*Completed: 2026-04-15*
