# Phase 1: Async Persistence Refactor - Context

**Gathered:** 2026-04-14  
**Status:** Ready for planning  
**Source:** /gsd-discuss-phase 1

<domain>
## Phase Boundary

Refactor `ConversationStore` (`src/memory.ts`) to eliminate all synchronous `fs` calls (`existsSync`, `readFileSync`, `writeFileSync`) and replace them with asynchronous equivalents from `fs/promises`. The refactor must:
- Remove event-loop blocking on every `append`, `clear`, `clearAll`, and constructor invocation
- Prevent concurrent JSON-file corruption via an internal write queue
- Maintain backward compatibility for existing consumers of `ConversationStore`
- Preserve the existing JSON persistence format and corrupt-state recovery behavior
- Add or update unit tests for concurrency serialization and error recovery
</domain>

<decisions>
## Implementation Decisions

### I/O Error Handling (User Decision)
- **Decision:** Disk I/O errors in `save()` and `load()` should remain non-throwing (business flow continues), but must become observable by passing warnings to the injected logger.
- **Rationale:** Current code silently swallows errors in empty catch blocks. Making them visible via `logger?.warn` improves operability without breaking callers.
- **Implementation hint:** `ConversationStore` already accepts `BotConfig` which includes a `logger` field; use `this.logger.warn(...)` on persistence failures.

### BotOrchestrator Integration (User Decision)
- **Decision:** `ConversationStore` must use lazy/deferred initialization. The constructor stays synchronous, and the actual async `load()` runs on first access (`get`, `append`, etc.).
- **Rationale:** This avoids any changes to `BotOrchestrator` constructor or startup sequence. `BotOrchestrator.start()` remains non-async.
- **Implementation hint:** Guard first access with an `initialized` boolean + an internal `async init()` method that loads from disk once.

### Claude's Discretion
- **Public API signature:** Planner decides the cleanest backward-compatible path. Recommended approach: keep methods synchronous-returning for reads (`get`, `buildMessages`), but make mutating methods (`append`, `clear`, `clearAll`, `save`) return `Promise<void>` so callers can `await` if they care about durability. Existing callers who ignore the return value will continue to compile and run.
- **Write-queue implementation:** Planner decides queue mechanism. Recommended: a simple in-memory Promise chain (e.g., `this.saveQueue = this.saveQueue.then(...).catch(...)`) rather than pulling in an external queue library.
- **File-write atomicity:** Planner decides POSIX vs Windows strategy. Recommended: on POSIX use temp-file + `rename`; on Windows use direct serialized `writeFile` because the in-memory queue already eliminates concurrent writes.
- **Test coverage:** Planner scopes vitest tests. Recommended tests: (1) concurrent `append` calls result in exactly one disk write at a time, (2) corrupt file is handled gracefully, (3) lazy initialization only reads disk once.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Requirements
- `.planning/REQUIREMENTS.md` — Phase 1 requirements (PERSIST-01 through PERSIST-05, COMPAT-01, COMPAT-02, TEST-01)
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria
- `.planning/PROJECT.md` — Project scope, key decisions, and out-of-scope items
- `.planning/research/SUMMARY.md` — Research findings on async persistence pitfalls and stack recommendations

### Existing Code
- `src/memory.ts` — Current `ConversationStore` implementation (sync I/O)
- `src/bot/index.ts` — `BotOrchestrator` integration point with `ConversationStore`
- `src/config/index.ts` — `BotConfig` shape, includes `logger` interface
</canonical_refs>

<specifics>
## Specific Ideas

- Use `fs/promises` from Node.js 22 built-ins; no new dependencies.
- Keep JSON persistence format identical so existing `persistencePath` files work without migration.
- The in-memory `Map<string, ConversationRecord>` remains the hot-read source; disk is only for durability.
- Maintain existing TTL, LRU, and sliding-window eviction logic unchanged.
</specifics>

<deferred>
## Deferred Ideas

- Pluggable persistence backend (Redis, SQLite) — good future enhancement, but out of scope for this phase
- Batched/debounced writes — can be added later as a performance optimization without breaking the async API
- Encryption-at-rest for persistence file — deferred per PROJECT.md
</deferred>

---

*Phase: 01-async-persistence-refactor*  
*Context gathered: 2026-04-14 via /gsd-discuss-phase 1*
