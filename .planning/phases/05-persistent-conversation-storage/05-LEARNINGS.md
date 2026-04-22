---
phase: 5
phase_name: "Persistent Conversation Storage"
project: "aibot-node-sdk"
generated: "2026-04-20T00:00:00Z"
counts:
  decisions: 9
  lessons: 3
  patterns: 6
  surprises: 4
missing_artifacts:
  - "VERIFICATION.md"
---

# Phase 5 Learnings: Persistent Conversation Storage

## Decisions

### PersistenceBackend Interface Isolates Storage Logic
Created a `PersistenceBackend` interface with `load()`, `save()`, and `close()` methods. `ConversationStore` delegates all persistence to this interface, knowing nothing about files, SQLite, or serialization.

**Rationale:** Decouples storage mechanism from business logic. Enables swapping backends (JSON → SQLite → future backends) without changing ConversationStore. Makes testing easier via mock backends.
**Source:** 05-01-PLAN.md, 05-01-SUMMARY.md, STATE.md

---

### better-sqlite3 with WAL Mode for Production
Chose `better-sqlite3` over `sqlite3` or `node:sqlite` for its synchronous, prepared-statement API and native compilation. WAL mode enabled via `db.pragma('journal_mode = WAL')`.

**Rationale:** Synchronous API simplifies the implementation (no async/await in save/load), prepared statements prevent SQL injection, and WAL mode allows readers to proceed during writes without blocking.
**Source:** 05-01-PLAN.md, 05-01-SUMMARY.md, STATE.md

---

### Migration Renames (Not Deletes) Original JSON File
`SqliteBackend` migration renames the original `.bot-state.json` to `.bot-state.json.migrated-YYYYMMDD-HHMMSS` rather than deleting it.

**Rationale:** Safety — if migration fails or corrupts data, the original file is preserved for manual recovery. The timestamped suffix prevents overwriting on repeated runs.
**Source:** 05-01-PLAN.md, 05-01-SUMMARY.md, STATE.md

---

### TTL Filtering Stays in ConversationStore
Backends (`JsonFileBackend`, `SqliteBackend`) are responsible only for serialization/deserialization. TTL filtering (dropping expired records on load) remains in `ConversationStore`.

**Rationale:** Prevents backend duplication of TTL logic and ensures consistent behavior regardless of backend. The backend's job is "read/write the data"; the store's job is "manage the data's lifecycle."
**Source:** 05-01-PLAN.md, 05-02-PLAN.md

---

### In-Memory Map Remains Source of Truth for Reads
`ConversationStore.get()` reads directly from the in-memory `Map`. The backend is only touched during `init()` (load) and `save()` (persist).

**Rationale:** Keeps `get()` synchronous and fast (no I/O). The performance cost of backend reads on every message would be unacceptable for real-time chat. Persistence is "write-behind" via the save queue.
**Source:** 05-02-PLAN.md, 05-02-SUMMARY.md

---

### get() Remains Fully Synchronous
Despite introducing async backends, `ConversationStore.get()` has no `await` keyword. SQLite backend's synchronous API makes this possible.

**Rationale:** Chat message handling is on the hot path; every millisecond matters. A synchronous `get()` avoids event-loop deferral and keeps reply latency minimal.
**Source:** 05-02-PLAN.md, 05-02-SUMMARY.md

---

### SQLite DB Path Derived from persistencePath
When `persistenceBackend` is `'sqlite'`, the DB file path is computed as `persistencePath.replace(/\.json$/, '.db')`.

**Rationale:** Allows users to keep a single `PERSISTENCE_PATH` env var. The extension change is automatic and predictable. Users migrating from JSON don't need to learn a new config variable.
**Source:** 05-02-PLAN.md, 05-02-SUMMARY.md

---

### Async Shutdown Lifecycle: Store Before Transport
`BotOrchestrator.stop()` calls `await this.store.close()` BEFORE `this.transport.stop()`. `entry.ts` graceful shutdown awaits `bot.stop()` before `process.exit(0)`.

**Rationale:** Ensures SQLite WAL is flushed and DB connection closed before the process exits. Reversing the order risks WAL corruption if the transport teardown triggers additional save operations.
**Source:** 05-03-PLAN.md, 05-03-SUMMARY.md, STATE.md

---

### Docker Build Tools in Builder Stage Only
Added `python3 make g++` to the Dockerfile builder stage for compiling the better-sqlite3 native addon. The production stage copies the compiled binary without build tools.

**Rationale:** Native addons require a build environment at install time but not at runtime. Multi-stage builds keep the production image small and reduce attack surface.
**Source:** 05-02-PLAN.md, 05-02-SUMMARY.md

---

## Lessons

### Native Addon Build Can Be Deferred During Development
`pnpm install` ignored better-sqlite3 build scripts during development. TypeScript types resolved correctly without the compiled binary. The binary is only required at test/runtime time.

**Context:** This caused a brief surprise when tests failed with "Cannot find module" errors. Running `pnpm install` with build scripts enabled resolved it. The lesson is that native dependencies have a two-phase lifecycle: type-checking works immediately, execution needs the binary.
**Source:** 05-01-SUMMARY.md

---

### Backend-Level Error Swallowing Changes Test Expectations
When JSON persistence error handling moved from `ConversationStore.load()` into `JsonFileBackend.load()`, the existing "corrupt persistence file" test needed adjustment. `ConversationStore` now receives an empty object with no error to log.

**Context:** The original test asserted `logger.warn` was called. After refactoring, `JsonFileBackend` swallows the parse error and returns `{}`, so `ConversationStore.load()` has nothing to warn about. The test was updated to match the new architecture.
**Source:** 05-03-SUMMARY.md

---

### Migration Idempotency Test Needs Careful Setup Ordering
The test "does not migrate if DB already has data" initially failed because the JSON file was created before the first backend instance. The correct order is: create backend → save data → close → create JSON file → create second backend.

**Context:** This revealed that idempotency depends on the DB having data *before* the JSON file exists. Reversing the order made the test correctly verify the skip-logic.
**Source:** 05-03-SUMMARY.md

---

## Patterns

### Parameterized Shared Behavior Tests
`backends.test.ts` defines a `BackendFixture` interface and runs identical assertions against both `JsonFileBackend` and `SqliteBackend` in a parameterized loop.

**When to use:** Any time multiple implementations share the same interface. Guarantees behavioral parity and makes it impossible to add a feature to one backend without testing the other.
**Source:** 05-03-PLAN.md, 05-03-SUMMARY.md

---

### Atomic File Writes (Platform-Aware)
`JsonFileBackend.save()` writes to a temp file and renames on non-Windows platforms. On Windows, it writes directly due to file-locking constraints with rename operations.

**When to use:** Any file-based persistence where crash safety matters. The rename pattern is atomic on POSIX filesystems. The Windows fallback acknowledges platform differences rather than fighting them.
**Source:** 05-01-PLAN.md

---

### WAL Mode for SQLite Durability
SQLite WAL mode writes changes to a separate `-wal` file before checkpointing to the main DB. This allows concurrent reads during writes and survives crashes without corruption.

**When to use:** Any SQLite workload with concurrent read/write or where crash recovery is important. WAL is superior to rollback journal for the bot's write-behind pattern.
**Source:** 05-01-PLAN.md, 05-03-SUMMARY.md

---

### Pluggable Backend with Optional Constructor Override
`ConversationStore` constructor accepts `backend?: PersistenceBackend` as an optional second parameter. When provided, it overrides config/env selection. When omitted, the store auto-selects based on `persistenceBackend`.

**When to use:** Any service that needs both production auto-configuration and test mock injection. The explicit parameter is cleaner than environment-based test overrides.
**Source:** 05-02-PLAN.md, 05-02-SUMMARY.md

---

### Async Shutdown Lifecycle Ordering
Shutdown sequence: (1) drain pending save queue, (2) close backend (flush WAL), (3) stop transport, (4) exit process.

**When to use:** Any system with async persistence and network transport. The ordering ensures no in-flight writes are dropped and no new writes are triggered during teardown.
**Source:** 05-03-PLAN.md, 05-03-SUMMARY.md

---

### Safe Migration (Rename, Skip-if-Data, Catch-Corrupt)
Migration logic: check if DB is empty → parse JSON → filter expired → insert → rename JSON with timestamp. If any step fails, log warning and leave original file untouched.

**When to use:** Any data migration where rollback must be possible. The three safeguards (skip if target has data, rename don't delete, catch all errors) make the migration safe to run repeatedly.
**Source:** 05-01-PLAN.md, 05-03-SUMMARY.md

---

## Surprises

### +19 Tests with Zero Regressions
Test count grew from 79 to 98 (+19 new tests across 2 new test files + 3 updated files) with zero regressions in existing behavior.

**Impact:** The PersistenceBackend abstraction and parameterized test pattern made comprehensive coverage straightforward. Every new backend automatically inherits the full shared behavior test suite.
**Source:** 05-03-SUMMARY.md

---

### FallbackTransport Dedup Key Bug Discovered During UAT
UAT revealed that cross-transport event deduplication used only `msgid` as the key, causing message drops when the same msgid appeared in different event types. Fix: change dedup key to `${msgid}:${eventName}`.

**Impact:** This was a pre-existing v1.0 bug that only surfaced when testing real message flows with the new persistence layer. It was fixed during Phase 5 UAT and back-ported to the main branch.
**Source:** 05-UAT.md, STATE.md

---

### Dockerfile Needed Runtime Config Additions
The Dockerfile required `VOLUME ["/app/data"]` and `ENV PERSISTENCE_PATH=/app/data/.bot-state.json` additions during UAT to ensure SQLite data persisted across container restarts.

**Impact:** These were not anticipated in the original plan but are critical for production Docker deployments. The persistence path must be both configurable and volume-mounted.
**Source:** 05-UAT.md

---

### Docker Restart Preserves SQLite Data with WAL
Container restart with `docker restart` correctly preserved all conversation history. The WAL file (`-wal`) and shared-memory file (`-shm`) were both preserved inside the volume.

**Impact:** Validates that the WAL + multi-stage Docker build combination is production-ready. No special shutdown procedure is needed beyond the existing graceful shutdown.
**Source:** 05-UAT.md
