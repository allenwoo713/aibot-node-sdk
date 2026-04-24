---
phase: 11-testing-integration
plan: "03"
subsystem: bot
tags: [e2e-tests, vitest, schedule-command]
key-files:
  created:
    - __tests__/bot.schedule.e2e.test.ts
key-decisions: []
requirements-completed:
  - TEST-03
duration: "3 min"
completed: "2026-04-24"
---

# Phase 11 Plan 03: E2E Schedule Command Tests Summary

Created end-to-end tests for `/日程 创建` and `/日程 列表` through `BotOrchestrator`.

## What Changed

- `__tests__/bot.schedule.e2e.test.ts` — New E2E test file with 3 tests:
  - `end-to-end: /日程 创建 creates a schedule and confirms` — mocks `createSchedule` to return success, asserts `sendStream` receives confirmation with title
  - `end-to-end: /日程 列表 returns upcoming schedules` — mocks `scheduleStore.listUpcoming`, asserts `sendStream` receives list with seeded schedule
  - `end-to-end: /日程 创建 returns failure message on API error` — mocks `createSchedule` to return errcode 40001, asserts `sendStream` receives failure message

## Verification

- `npx vitest run __tests__/bot.schedule.e2e.test.ts` passes: **3 tests, 0 failures**
- `/日程 创建` end-to-end flow works through BotOrchestrator
- `/日程 列表` returns stored schedules
- API errors surface user-friendly messages

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

PASSED
