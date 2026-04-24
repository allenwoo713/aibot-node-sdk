# Phase 11 Context: Testing & Integration

## Goal
All new v1.2 features have automated test coverage that catches regressions.

## Requirements
- **TEST-01**: `access_token` refresh and retry logic is verified by unit tests with mocked HTTP
- **TEST-02**: Document download and analysis end-to-end flow is covered by integration tests
- **TEST-03**: Schedule create and query commands are covered by integration tests
- **TEST-04**: Command parser and router logic is covered by unit tests

## Success Criteria
1. `access_token` refresh and retry logic is verified by unit tests with mocked HTTP
2. Document download and analysis end-to-end flow is covered by integration tests
3. Schedule create and query commands are covered by integration tests
4. Command parser and router logic is covered by unit tests

## Existing State
- `src/api.test.ts` covers TokenManager + WeComApiClient.request() + sendTextMessage
- `src/bot/commands/document.test.ts` covers document command unit tests
- `src/bot/commands/schedule.test.ts` covers schedule command unit tests
- `src/bot/commands/index.test.ts` covers router dispatch
- `src/bot/index.test.ts` covers bot interception for both commands
- `__tests__/bot.e2e.test.ts` covers normal chat, API failure, multi-turn
- `__tests__/bot.*.e2e.test.ts` cover HTTP transport and fallback paths

## Identified Gaps
1. `WeComApiClient.createSchedule()` and `.getSchedule()` not directly unit tested
2. `WeComApiClient.getDocContent()` not directly unit tested
3. No E2E test for `/文档` command through BotOrchestrator
4. No E2E test for `/日程 创建` / `/日程 列表` through BotOrchestrator

## Technology
- vitest ^4.1.2
- Existing mock patterns: `vi.mock('axios')`, `vi.fn()` spies, EventEmitter transport mocks
