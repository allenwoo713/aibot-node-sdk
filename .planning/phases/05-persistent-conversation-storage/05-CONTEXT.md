# Phase 5: Persistent Conversation Storage - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace JSON file persistence with a pluggable backend system including SQLite with WAL mode, while preserving backward compatibility. The `ConversationStore` constructor must accept an optional pluggable `PersistenceBackend`, existing JSON logic is extracted into `JsonFileBackend`, and a new `SqliteBackend` is implemented. `ConversationStore.get()` remains synchronous by keeping an in-memory LRU cache in front of the backend. Existing `.bot-state.json` files are automatically migrated into SQLite on first startup when the DB is empty.

</domain>

<decisions>
## Implementation Decisions

### SQLite Library
- **D-01:** Use `better-sqlite3` as the SQLite driver. Rationale: mature synchronous API, high performance, and the sync API aligns naturally with the requirement that `get()` stays synchronous (the cache serves `get()`, but backend load can also be sync).
- **D-02:** Add `better-sqlite3` to `dependencies` in `package.json` and `@types/better-sqlite3` to `devDependencies`.
- **D-03:** Enable WAL mode on the SQLite database via `db.pragma('journal_mode = WAL')`.

### Backend Selection Mechanism
- **D-04:** Add `persistenceBackend: 'json' | 'sqlite'` to `BotConfig`, defaulting to `'json'` for backward compatibility.
- **D-05:** Load `persistenceBackend` from the `PERSISTENCE_BACKEND` environment variable. If unset, default to `'json'`.
- **D-06:** `ConversationStore` constructor also accepts an optional `backend?: PersistenceBackend` parameter. If a backend instance is passed explicitly, it overrides the config/env selection. This satisfies PERS-01 (pluggable backend) and allows custom implementations without config changes.
- **D-07:** When `persistenceBackend` is `'sqlite'`, derive the DB file path from `persistencePath` by changing the extension to `.db` (e.g., `.bot-state.json` → `.bot-state.db`). Keep `persistencePath` meaning the "primary persistence file path" regardless of backend.

### Migration Behavior
- **D-08:** On first startup with SQLite backend, if the DB file does not exist and a `.bot-state.json` file exists at `persistencePath`, read the JSON, import all non-expired conversations into SQLite, then rename the JSON file to `.bot-state.json.migrated-{timestamp}`.
- **D-09:** The `{timestamp}` format is `YYYYMMDD-HHMMSS` in local time (e.g., `.bot-state.json.migrated-20260419-143052`).
- **D-10:** If migration fails (corrupt JSON, disk error), log a warning, start with an empty DB, and leave the original JSON file untouched.
- **D-11:** Do not attempt migration if the SQLite DB already has data (non-empty `conversations` table).

### Backend Lifecycle / Shutdown
- **D-12:** `PersistenceBackend` interface must include `close(): void | Promise<void>`.
- **D-13:** `ConversationStore` exposes `async close(): Promise<void>` that delegates to `backend.close()` (if defined) and drains any pending save queue.
- **D-14:** `BotOrchestrator.stop()` becomes `async stop(): Promise<void>`, calling `await this.store.close()` before stopping transport.
- **D-15:** `entry.ts` graceful shutdown becomes async: `await bot.stop()` before `process.exit(0)`.

### Cache-Backend Sync
- **D-16:** The in-memory `Map<string, ConversationRecord>` remains the source of truth for `get()`. The backend is only read during `init()` (lazy, on first mutation) and written during `save()`.
- **D-17:** `SqliteBackend` uses serialized writes (the existing saveQueue in `ConversationStore` already guarantees this). No additional locking needed at the backend level.
- **D-18:** SQLite schema: one `conversations` table with columns `conversation_id TEXT PRIMARY KEY`, `messages TEXT` (JSON array), `last_accessed_at INTEGER`.

### Claude's Discretion
- Exact `better-sqlite3` API usage (prepared statements vs. direct exec) — use standard patterns.
- SQLite connection pooling — `better-sqlite3` uses a single connection, which is fine for this single-process SDK.
- Error handling during `close()` — log warnings but do not throw to avoid crashing shutdown.
- Test helper for SQLite backend isolation — use temp file per test or in-memory DB.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria, and requirements mapping
- `.planning/REQUIREMENTS.md` — PERS-01 through PERS-06 acceptance criteria

### Existing Code
- `src/memory.ts` — Current `ConversationStore` implementation with JSON persistence, lazy init, save queue, TTL, LRU, sliding window
- `src/memory.test.ts` — Existing test coverage for `ConversationStore`
- `src/bot/index.ts` — `BotOrchestrator` that creates and uses `ConversationStore`
- `src/bot/entry.ts` — Graceful shutdown logic (currently sync)
- `src/config/index.ts` — `BotConfig` interface and `loadConfig()`
- `package.json` — Dependency list (no SQLite yet)
- `Dockerfile` — Build environment (Node 22 alpine)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConversationStore` already has async init, save queue, lazy loading, TTL eviction, LRU cap, sliding window — all of these behaviors are preserved
- `BotConfig` and `loadConfig()` provide a clear place to add `persistenceBackend`
- Existing `HistoryMessage` and `ConversationRecord` types define the data shape

### Established Patterns
- Best-effort error suppression: `load()` and `save()` catch errors and log warnings rather than throwing
- Environment-based configuration: all tunables are loaded from `process.env` via `getEnv()` / `getEnvInt()`
- Write queue pattern: `saveQueue` chains saves to prevent concurrent writes

### Integration Points
- `BotOrchestrator` constructs `ConversationStore` in its constructor — will need to pass the selected backend
- `BotOrchestrator.stop()` currently only stops transport — needs to call `store.close()`
- `entry.ts` calls `bot.stop()` synchronously on SIGINT/SIGTERM — needs to become async
- Phase 6 (Integration) depends on these lifecycle changes

</code_context>

<specifics>
## Specific Ideas

- `better-sqlite3` chosen over `node:sqlite` (built-in) despite the native compilation requirement — user values the maturity and synchronous API
- Migration timestamp format: `YYYYMMDD-HHMMSS` local time
- DB path derived from `persistencePath` by swapping `.json` for `.db`

</specifics>

<deferred>
## Deferred Ideas

- MongoDB backend (OOS-01 from REQUIREMENTS.md)
- Encryption-at-rest inside the SDK (OOS-05 from REQUIREMENTS.md)
- Per-conversation budget ceiling / cost tracking across days (future milestone)

</deferred>

---

*Phase: 05-persistent-conversation-storage*
*Context gathered: 2026-04-19*
