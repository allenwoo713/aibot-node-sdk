# Phase 11 Research: Testing & Integration Coverage Audit

## Existing Test Coverage (v1.2 Features)

### Phase 7: WeCom API Client
- `src/api.test.ts` — TokenManager (cache, dedup, file persist, proactive refresh, timer cleanup)
- `src/api.test.ts` — WeComApiClient.request() (token injection, 40014/40001 retry, SSRF)
- `src/api.test.ts` — sendTextMessage delegation
- **Gap**: `createSchedule()`, `getSchedule()`, `getDocContent()` are NOT directly tested in api.test.ts

### Phase 8: Docker Compose
- `src/health.test.ts` — Health server
- No direct Docker test (by design — infra tests are manual)

### Phase 9: Document Reading
- `src/bot/commands/document.test.ts` — Unit tests for parseDocumentCommand + handleDocumentCommand
- `src/bot/commands/index.test.ts` — Router dispatch tests
- **Gap**: No E2E test for `/文档` through BotOrchestrator with real document API flow

### Phase 10: Schedule Management
- `src/bot/date-parser.test.ts` — Layer 1 extraction (12 tests)
- `src/bot/schedule-store.test.ts` — Persistence and listing (7 tests)
- `src/bot/commands/schedule.test.ts` — Unit tests for parseScheduleCommand + handleScheduleCommand
- `src/bot/index.test.ts` — Bot interception + rate limit tests for `/日程`
- **Gap**: No E2E test for `/日程 创建` / `/日程 列表` through BotOrchestrator

### E2E Test Suite
- `__tests__/bot.e2e.test.ts` — Normal chat, API failure fallback, multi-turn history
- `__tests__/bot.http.e2e.test.ts` — HTTP transport path
- `__tests__/bot.fallback.e2e.test.ts` — Fallback transport
- `__tests__/bot.entry.smoke.test.ts` — Entry point smoke
- **Gap**: No E2E coverage for `/文档` or `/日程` commands

## Gap Summary

| Requirement | Status | Gap |
|-------------|--------|-----|
| TEST-01: access_token refresh/retry | Covered | `createSchedule`/`getSchedule` not directly tested in api.test.ts |
| TEST-02: Document end-to-end | Partial | Unit tests exist; no E2E through BotOrchestrator |
| TEST-03: Schedule end-to-end | Partial | Unit tests exist; no E2E through BotOrchestrator |
| TEST-04: Command parser/router | Covered | Index + document + schedule test files |

## Phase 11 Plan Direction

1. **Direct API client tests**: Add `createSchedule`, `getSchedule`, and `getDocContent` tests to `src/api.test.ts`
2. **E2E document command test**: Add `/文档` flow to `__tests__/bot.e2e.test.ts` (or new file)
3. **E2E schedule command test**: Add `/日程 创建` and `/日程 列表` flow to E2E suite
