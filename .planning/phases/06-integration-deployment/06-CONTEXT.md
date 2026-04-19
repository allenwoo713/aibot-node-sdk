---
name: Phase 6 Context
description: Integration & Deployment — Dockerfile fix, public API exports, Docker verification
type: project
---

# Phase 6: Integration & Deployment - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Source:** Continue-here handoff + ROADMAP.md

## Phase Boundary

Phase 6 delivers the final integration and deployment artifacts for v1.1:
1. Fix Dockerfile production stage for better-sqlite3 native addon
2. Export persistence layer from SDK public API (`src/index.ts`)
3. Verify Docker image builds end-to-end

Much of original Phase 6 scope (graceful shutdown, async lifecycle) was absorbed into Phase 5.

## Implementation Decisions

### Dockerfile
- **Production stage cannot install better-sqlite3 without build tools.** Decision: copy `node_modules` from builder stage instead of running `pnpm install --prod` in production stage.
- Builder stage already has `python3 make g++` installed.
- Production stage should remain minimal (no build tools).

### Public API Exports
- `PersistenceBackend` interface must be exported for consumers who want custom backends
- `JsonFileBackend` and `SqliteBackend` must be exported for consumers to choose explicitly
- `ConversationStore` and related types (`HistoryMessage`, `ConversationRecord`) must be exported
- These are already implemented in Phase 5; Phase 6 only adds exports to `src/index.ts`

### Testing
- Full test suite (98 tests from Phase 5) must continue passing
- Docker build verification is a manual/smoke test, not a unit test

## Canonical References

- `src/index.ts` — current public API exports
- `Dockerfile` — current multi-stage build (has production-stage bug)
- `src/memory.ts` — ConversationStore and persistence types
- `src/persistence/` — PersistenceBackend implementations (from Phase 5)
- `.planning/ROADMAP.md` — Phase 6 success criteria

## Specific Ideas

### Dockerfile Fix
Current bug: production stage runs `pnpm install --prod --frozen-lockfile` but better-sqlite3 is a native addon that needs compilation. Without `python3 make g++`, this fails.

Fix: In production stage, copy `node_modules` from builder:
```dockerfile
COPY --from=builder /app/node_modules ./node_modules
```
Instead of:
```dockerfile
RUN pnpm install --prod --frozen-lockfile
```

### Export List for src/index.ts
Add to existing exports:
- `ConversationStore` from `'./memory'`
- `PersistenceBackend` from `'./persistence/backend'`
- `JsonFileBackend` from `'./persistence/json-file-backend'`
- `SqliteBackend` from `'./persistence/sqlite-backend'`
- Types: `HistoryMessage`, `ConversationRecord` from `'./types'`

## Deferred Ideas

None — phase scope is minimal and complete.

---

*Phase: 06-integration-deployment*
*Context gathered: 2026-04-20 via handoff continuation*
