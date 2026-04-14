---
phase: 01-async-persistence-refactor
plan: 02
subsystem: bot + persistence
tags: [async, typescript, vitest, logger]
dependency_graph:
  requires: [01-01]
  provides: []
  affects: [src/bot/index.ts, src/config/index.ts, src/memory.test.ts]
tech_stack:
  added: []
  patterns: [Promise queue serialization, lazy initialization, vitest spies]
key_files:
  created: []
  modified:
    - src/bot/index.ts
    - src/config/index.ts
    - src/memory.test.ts
decisions:
  - Imported Logger from ../types (central types index) rather than adding a local config/types module
metrics:
  duration: "~15m"
  completed_date: "2026-04-14"
---

# Phase 01 Plan 02: Async Persistence Consumer Integration Summary

**One-liner:** Wired `Logger` into `BotOrchestrator`, awaited all async `ConversationStore` mutating calls, and expanded `src/memory.test.ts` with 4 vitest tests covering lazy init, concurrent-write serialization, corrupt-file recovery, and save-error logging.

## What Was Done

1. **BotOrchestrator async integration**
   - Added `private logger: Logger` to `BotOrchestrator` and instantiated `DefaultLogger` as a fallback.
   - Passed the logger into `ConversationStore` constructor.
   - Added `await` to the `store.append` call in `handleTextMessage`.

2. **BotConfig extension**
   - Added optional `logger?: Logger` to `BotConfig` so external consumers can inject observability.

3. **Unit test expansion**
   - Added `createMockLogger` helper and `fs/promises` spy utilities.
   - Added 4 new tests under `describe('async persistence')`:
     - **lazy init:** Confirms `new ConversationStore()` does not trigger `fs.readFile`, but the first `append` does.
     - **concurrent writes:** Fires 5 concurrent appends and asserts only one `fs.writeFile` is in-flight at a time, with all 5 messages persisted in order.
     - **corrupt recovery:** Writes invalid JSON to the persistence path, asserts the store logs a `warn` containing "load conversation state", discards corrupt data, and appends successfully.
     - **save error logging:** Mocks `fs.writeFile` to reject, asserts `append` does not throw and logs a `warn` containing "save conversation state".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed recursive mock causing test timeout**
- **Found during:** Task 2 (concurrent writes test)
- **Issue:** The `vi.spyOn(fsPromises, 'writeFile').mockImplementation(...)` called `fsPromises.writeFile` inside the mock, causing infinite recursion and a 5-second test timeout.
- **Fix:** Replaced the recursive call with `fs.writeFileSync` to perform the actual disk write without re-triggering the mock.
- **Files modified:** `src/memory.test.ts`
- **Commit:** `be8db08`

**2. [Rule 1 - Bug] Corrected Logger import path in BotConfig**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `src/config/index.ts` imported `Logger` from `./types`, which does not exist in the `config` directory.
- **Fix:** Changed import to `../types` (the central types index).
- **Files modified:** `src/config/index.ts`
- **Commit:** `d73ff05`

### Out-of-scope Discoveries

- Pre-existing test files in `.claude/worktrees/agent-a13ac8a6/` and `.claude/worktrees/agent-ae51c9cb/` fail when `vitest run` scans the entire repository. These failures are unrelated to this plan's changes and were not fixed.

## Verification Results

- `npx tsc --noEmit` — zero TypeScript errors.
- Main-repo memory tests (`src/memory.test.ts`) — 23/23 passed.
- `grep` verification in `src/bot/index.ts` — `store.append` is awaited.

## Commits

| Hash | Message |
|------|---------|
| `41cabdb` | feat(01-02): wire logger into BotOrchestrator and await async store calls |
| `ace6821` | test(01-02): add async persistence unit tests |
| `d73ff05` | fix(01-02): correct Logger import path in BotConfig |
| `be8db08` | fix(01-02): avoid recursive mock in concurrent write test |

## Self-Check: PASSED

- [x] `src/bot/index.ts` exists and contains awaited `store.append`
- [x] `src/config/index.ts` exists and exports `logger?: Logger`
- [x] `src/memory.test.ts` exists with 4 new async-persistence tests
- [x] All commits exist in `git log`
