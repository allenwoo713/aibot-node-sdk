---
phase: 10-schedule-management-integration
plan: "04"
subsystem: bot
tags: [tests, unit-tests, vitest]
key-files:
  created:
    - src/bot/date-parser.test.ts
    - src/bot/schedule-store.test.ts
    - src/bot/commands/document.test.ts
    - src/bot/commands/schedule.test.ts
  modified:
    - src/bot/commands/index.test.ts
    - src/bot/index.test.ts
    - src/bot/date-parser.ts
    - src/bot/schedule-store.ts
key-decisions:
  - Fixed date-parser to prioritize 下下周 over 下周 regex matching to avoid substring mis-match
  - Fixed schedule-store to create parent directory before writing schedules.json
requirements-completed:
  - TEST-01
  - TEST-02
  - TEST-03
  - TEST-04
  - TEST-05
duration: "12 min"
completed: "2026-04-24"
---

# Phase 10 Plan 04: Unit Tests for Schedule Management Summary

Created comprehensive unit tests for all new schedule management code and fixed two bugs discovered during test writing.

## What Changed

- `src/bot/date-parser.test.ts` — 12 tests covering empty input, missing keywords, 今天/明天/后天, 下周X, 下下周X, colon/dot time formats, 半小时/一小时/两小时 durations, title truncation, and empty-title fallback
- `src/bot/schedule-store.test.ts` — 7 tests for empty start, add + list, userid filtering, past-event filtering, ascending sort, limit respect, and cross-instance persistence
- `src/bot/commands/document.test.ts` — Extracted and expanded document command tests from old `index.test.ts`
- `src/bot/commands/schedule.test.ts` — Tests for parseScheduleCommand (create/list/bare) and handleScheduleCommand (list empty-state, list formatted, create empty-arg, Layer 1 success, Layer 2 AI fallback success, Layer 2 AI error, Layer 2 invalid JSON, Layer 2 incomplete fields, WeCom API non-zero errcode, WeCom API thrown error)
- `src/bot/commands/index.test.ts` — Rewritten as thin router dispatch tests: parseCommand returns correct type, handleCommand dispatches to the right handler with correct arguments
- `src/bot/index.test.ts` — Added `describe('schedule commands')` with interception tests for `/日程 列表` and `/日程 创建`, plus rate-limiting verification

## Bug Fixes Discovered During Testing

| Bug | File | Fix |
|-----|------|-----|
| `下下周X` mis-matched as `下周X` | `src/bot/date-parser.ts` | Swapped regex check order so `下下周` is tested before `下周` |
| `save()` silently fails when parent dir missing | `src/bot/schedule-store.ts` | Added `fs.mkdirSync(dir, { recursive: true })` before `writeFileSync` |

## Tasks

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create date-parser.test.ts and schedule-store.test.ts | `840f913` |
| 2 | Create document.test.ts and schedule.test.ts | `840f913` |
| 3 | Rewrite commands/index.test.ts and extend bot/index.test.ts | `840f913` |

## Verification

- `npx tsc --noEmit` passes with zero errors
- `npx vitest run` passes: **22 files, 176 tests** (0 failures)
- `/文档` command tests still pass (no regression)
- `/日程 创建` and `/日程 列表` tests cover happy path, AI fallback, and error handling
- Router dispatch tests verify correct delegation without duplicating handler logic

## Deviations from Plan

None — plan executed as written. Two source-file bugs were discovered and fixed inline during test execution.

## Self-Check

PASSED
