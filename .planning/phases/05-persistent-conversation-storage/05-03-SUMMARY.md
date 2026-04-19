---
phase: 05-persistent-conversation-storage
plan: 03
status: complete
completed: "2026-04-19"
---

# Plan 05-03 Summary: Lifecycle Wiring + Comprehensive Tests

## What Was Built

Wired async shutdown lifecycle through the bot stack and created comprehensive test coverage for all persistence backends.

### Files Modified

- **src/bot/index.ts** — `stop()` is now `async stop(): Promise<void>`:
  - Calls `await this.store.close()` BEFORE `this.transport.stop()`
  - Ensures SQLite WAL is flushed and DB connection closed before transport teardown

- **src/bot/entry.ts** — `gracefulShutdown` is now async:
  - `await bot.stop()` before `process.exit(0)`
  - Prevents WAL corruption and data loss on SIGINT/SIGTERM

- **src/memory.test.ts** — Updated for refactored ConversationStore:
  - `createStore()` includes `persistenceBackend: 'json'`
  - Added test for optional backend parameter override
  - Added test for `close()` draining pending save queue with slow mock backend
  - Expanded cleanup to handle `.db`, `-wal`, `-shm`, and `.migrated-*` files
  - Updated corrupt-file test to match new backend architecture

- **src/bot/index.test.ts** — Updated for async stop():
  - `createBot()` includes `persistenceBackend: 'json'`
  - Added test: `stop()` calls `store.close()`
  - Expanded cleanup for DB and migrated files

- **__tests__/bot.entry.smoke.test.ts** — Updated smoke test:
  - Mock config includes `persistenceBackend: 'json'`
  - `await bot.stop()` in smoke test
  - Expanded cleanup

### Files Created

- **src/persistence/backends.test.ts** — Parameterized shared behavior tests:
  - Empty load, round-trip, overwrite, multiple conversations, empty save
  - Runs identical assertions against both JsonFileBackend and SqliteBackend

- **src/persistence/sqlite-backend.test.ts** — SQLite-specific tests:
  - WAL mode enabled (verifies `-wal` file exists after write)
  - Migration happy path (non-expired conversations imported, JSON renamed)
  - Migration idempotency (skips if DB already has data)
  - Corrupt JSON handling (logs warning, leaves original file untouched)
  - Missing JSON file handling
  - Close without throwing

## Verification

- `npx vitest run --reporter=verbose` passes with 98 tests across 15 test files
- Test count increased from 79 → 98 (+19 tests)
- `npx tsc --noEmit` passes with zero errors
- No regressions in existing test behavior

## Self-Check

- [x] All tasks executed
- [x] Each task committed individually
- [x] All tests pass
- [x] TypeScript compilation passes
- [x] No existing test behavior regressed

## Notes

Two minor test adjustments were made during execution:
1. The "corrupt persistence file" test was updated to not assert on `logger.warn` because JsonFileBackend now swallows parse errors at the backend layer (matching the plan's explicit spec), and ConversationStore.load() receives an empty object with no error to log.
2. The migration idempotency test was restructured so the DB is populated before the JSON file is created, correctly testing "DB with data skips migration."
