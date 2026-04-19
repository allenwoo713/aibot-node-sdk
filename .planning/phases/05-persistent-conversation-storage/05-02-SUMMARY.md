---
phase: 05-persistent-conversation-storage
plan: 02
status: complete
completed: "2026-04-19"
---

# Plan 05-02 Summary: Refactor ConversationStore with Pluggable Backend

## What Was Built

Refactored the existing ConversationStore to delegate all persistence operations through the PersistenceBackend interface while preserving every existing behavior.

### Files Modified

- **src/memory.ts** — Refactored ConversationStore:
  - Imports types and backends from `src/persistence/`
  - Constructor accepts optional `backend?: PersistenceBackend` parameter
  - Auto-selects `JsonFileBackend` or `SqliteBackend` based on `config.persistenceBackend`
  - SQLite DB path derived from `persistencePath` via `.replace(/\.json$/, '.db')`
  - `load()` and `doSave()` delegate to backend; TTL filtering stays in ConversationStore
  - Added `async close()` that drains save queue then calls `backend.close()`
  - `get()` remains fully synchronous (no await)
  - Re-exports `HistoryMessage` and `ConversationRecord` from persistence layer

- **src/config/index.ts** — Added `persistenceBackend: 'json' | 'sqlite'` to BotConfig:
  - Loaded from `PERSISTENCE_BACKEND` env var with default `'json'`
  - Validation throws descriptive error for invalid values

- **Dockerfile** — Added `python3 make g++` to builder stage for better-sqlite3 native compilation

- **.env.example** — Documented `PERSISTENCE_BACKEND` option

## Verification

- `npx tsc --noEmit` passes with zero errors
- No existing behavior changed: sync get, lazy init, save queue, TTL, LRU, sliding window all preserved

## Self-Check

- [x] All tasks executed
- [x] Each task committed individually
- [x] TypeScript compilation passes
- [x] Existing behavior preserved exactly

## Notes

The production Docker stage does not need build tools because the multi-stage build copies compiled `node_modules` (including the native `.node` addon) from the builder stage.
