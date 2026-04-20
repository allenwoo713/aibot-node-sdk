---
phase: 06-integration-deployment
plan: 01
type: execute
wave: 1
status: completed
completed_at: "2026-04-20"
---

# Phase 6 Plan 01 — Summary

## Objective
Fix Dockerfile production stage for better-sqlite3, export persistence layer from SDK public API, and verify INTEG-01/INTEG-02.

## Tasks Completed

### Task 1: Fix Dockerfile production stage
- Removed `RUN pnpm install --prod --frozen-lockfile` from production stage
- Added `COPY --from=builder /app/node_modules ./node_modules`
- Rationale: better-sqlite3 native addon is compiled in builder stage (with python3/make/g++); copying avoids recompilation in production stage which lacks build tools

### Task 2: Export persistence layer from SDK public API
Added to `src/index.ts`:
- `export { ConversationStore } from './memory';`
- `export { PersistenceBackend } from './persistence';`
- `export { JsonFileBackend } from './persistence/json-file-backend';`
- `export { SqliteBackend } from './persistence/sqlite-backend';`
- `export type { HistoryMessage, ConversationRecord } from './persistence';`

All six identifiers are present in `dist/index.d.ts` after build.

### Task 3: Verify INTEG-01 and INTEG-02
- **INTEG-01 verified**: `src/bot/index.ts:43` — `async stop()` calls `await this.store.close()`
- **INTEG-02 verified**: `src/bot/entry.ts:26-33` — `async gracefulShutdown()` calls `await bot.stop()`, registered on `SIGINT` and `SIGTERM`

Both were already implemented in Phase 5; no file changes required.

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Dockerfile node_modules copy | `grep "COPY --from=builder /app/node_modules" Dockerfile` | PASS (line 28) |
| No prod install in Dockerfile | `grep -c "pnpm install --prod" Dockerfile` | PASS (0) |
| Export ConversationStore | `grep "export { ConversationStore }" src/index.ts` | PASS |
| Export PersistenceBackend | `grep "export { PersistenceBackend }" src/index.ts` | PASS |
| Export JsonFileBackend | `grep "export { JsonFileBackend }" src/index.ts` | PASS |
| Export SqliteBackend | `grep "export { SqliteBackend }" src/index.ts` | PASS |
| Export types | `grep "export type { HistoryMessage, ConversationRecord }" src/index.ts` | PASS |
| TypeScript build | `pnpm run build` | PASS (exit 0) |
| Bundled declarations | `grep "ConversationStore" dist/index.d.ts` | PASS |
| INTEG-01 | `grep "await this.store.close()" src/bot/index.ts` | PASS |
| INTEG-02 | `grep "await bot.stop()" src/bot/entry.ts` | PASS |

## Success Criteria
- [x] Dockerfile production stage copies node_modules from builder and does not attempt `pnpm install --prod`
- [x] src/index.ts exports ConversationStore, PersistenceBackend, JsonFileBackend, SqliteBackend, HistoryMessage, ConversationRecord
- [x] `pnpm run build` completes with exit code 0
- [x] dist/index.d.ts contains ConversationStore export
- [x] INTEG-01 verified: BotOrchestrator.stop() closes persistence backend
- [x] INTEG-02 verified: entry.ts async gracefulShutdown awaits bot.stop()

## Files Modified
- `Dockerfile`
- `src/index.ts`

## Blockers
None.
