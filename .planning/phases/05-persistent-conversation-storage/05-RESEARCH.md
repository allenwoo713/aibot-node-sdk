# Phase 5: Persistent Conversation Storage - Research

**Researched:** 2026-04-19
**Domain:** SQLite persistence layer for Node.js TypeScript SDK
**Confidence:** HIGH

## Summary

Phase 5 replaces the existing JSON file persistence in `ConversationStore` with a pluggable backend system. The locked decision is to use `better-sqlite3` (v12.9.0) as the SQLite driver, with WAL mode enabled, while preserving backward compatibility through an extracted `JsonFileBackend`. The in-memory `Map` cache remains the source of truth for synchronous `get()` access, and the backend handles durable storage.

Key architectural insight: `better-sqlite3` provides a synchronous API that aligns naturally with the existing `ConversationStore` patterns. The `saveQueue` already serializes writes, so no additional locking is needed. WAL mode gives concurrent read performance and crash safety without file-level locking.

**Primary recommendation:** Implement `PersistenceBackend` as a minimal interface (`load()`, `save()`, `close()`), extract existing JSON logic into `JsonFileBackend`, implement `SqliteBackend` with prepared statements and WAL, and wire backend selection through `BotConfig` / env var. Ensure `BotOrchestrator.stop()` and `entry.ts` shutdown become async to close the DB cleanly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| In-memory LRU cache | SDK runtime (Node.js process) | — | `get()` must remain sync; cache is source of truth |
| Durable persistence | SDK runtime (Node.js process) | — | Single-process SDK; SQLite file lives alongside bot |
| Backend selection | SDK runtime (config load time) | — | Determined by `BotConfig` / env var at startup |
| Migration (JSON → SQLite) | SDK runtime (first startup) | — | One-time, best-effort, non-blocking |
| Graceful shutdown | SDK runtime (signal handler) | — | `entry.ts` SIGINT/SIGTERM handler |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `better-sqlite3` as the SQLite driver. Rationale: mature synchronous API, high performance, and the sync API aligns naturally with the requirement that `get()` stays synchronous.
- **D-02:** Add `better-sqlite3` to `dependencies` in `package.json` and `@types/better-sqlite3` to `devDependencies`.
- **D-03:** Enable WAL mode on the SQLite database via `db.pragma('journal_mode = WAL')`.
- **D-04:** Add `persistenceBackend: 'json' | 'sqlite'` to `BotConfig`, defaulting to `'json'` for backward compatibility.
- **D-05:** Load `persistenceBackend` from the `PERSISTENCE_BACKEND` environment variable. If unset, default to `'json'`.
- **D-06:** `ConversationStore` constructor also accepts an optional `backend?: PersistenceBackend` parameter. If a backend instance is passed explicitly, it overrides the config/env selection.
- **D-07:** When `persistenceBackend` is `'sqlite'`, derive the DB file path from `persistencePath` by changing the extension to `.db` (e.g., `.bot-state.json` → `.bot-state.db`). Keep `persistencePath` meaning the "primary persistence file path" regardless of backend.
- **D-08:** On first startup with SQLite backend, if the DB file does not exist and a `.bot-state.json` file exists at `persistencePath`, read the JSON, import all non-expired conversations into SQLite, then rename the JSON file to `.bot-state.json.migrated-{timestamp}`.
- **D-09:** The `{timestamp}` format is `YYYYMMDD-HHMMSS` in local time.
- **D-10:** If migration fails (corrupt JSON, disk error), log a warning, start with an empty DB, and leave the original JSON file untouched.
- **D-11:** Do not attempt migration if the SQLite DB already has data (non-empty `conversations` table).
- **D-12:** `PersistenceBackend` interface must include `close(): void | Promise<void>`.
- **D-13:** `ConversationStore` exposes `async close(): Promise<void>` that delegates to `backend.close()` (if defined) and drains any pending save queue.
- **D-14:** `BotOrchestrator.stop()` becomes `async stop(): Promise<void>`, calling `await this.store.close()` before stopping transport.
- **D-15:** `entry.ts` graceful shutdown becomes async: `await bot.stop()` before `process.exit(0)`.
- **D-16:** The in-memory `Map<string, ConversationRecord>` remains the source of truth for `get()`. The backend is only read during `init()` (lazy, on first mutation) and written during `save()`.
- **D-17:** `SqliteBackend` uses serialized writes (the existing `saveQueue` in `ConversationStore` already guarantees this). No additional locking needed at the backend level.
- **D-18:** SQLite schema: one `conversations` table with columns `conversation_id TEXT PRIMARY KEY`, `messages TEXT` (JSON array), `last_accessed_at INTEGER`.

### Claude's Discretion
- Exact `better-sqlite3` API usage (prepared statements vs. direct exec) — use standard patterns.
- SQLite connection pooling — `better-sqlite3` uses a single connection, which is fine for this single-process SDK.
- Error handling during `close()` — log warnings but do not throw to avoid crashing shutdown.
- Test helper for SQLite backend isolation — use temp file per test or in-memory DB.

### Deferred Ideas (OUT OF SCOPE)
- MongoDB backend (OOS-01 from REQUIREMENTS.md)
- Encryption-at-rest inside the SDK (OOS-05 from REQUIREMENTS.md)
- Per-conversation budget ceiling / cost tracking across days (future milestone)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERS-01 | `ConversationStore` constructor accepts an optional pluggable `PersistenceBackend` while defaulting to existing JSON behavior | `PersistenceBackend` interface design; constructor overload pattern |
| PERS-02 | Existing JSON persistence logic is extracted into `JsonFileBackend` without behavior changes | Current `load()`/`doSave()` logic in `memory.ts` is already isolated; extract verbatim |
| PERS-03 | A new `SqliteBackend` implements `PersistenceBackend` using SQLite with WAL mode and serialized writes | `better-sqlite3` sync API with `db.prepare()`, `db.pragma('journal_mode = WAL')`, `db.transaction()` |
| PERS-04 | `ConversationStore.get()` remains synchronous by keeping an in-memory LRU cache in front of the backend | Existing `Map` cache pattern preserved; backend only accessed on `init()` and `save()` |
| PERS-05 | Existing `.bot-state.json` files are automatically migrated into SQLite on first startup when the DB is empty | Migration logic: check DB empty → parse JSON → filter TTL → insert → rename JSON |
| PERS-06 | All persistence backends are covered by dedicated unit tests and run through shared behavior assertions | Shared test helper pattern: parameterized tests over `JsonFileBackend` and `SqliteBackend` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.9.0 | SQLite driver with synchronous API | Mature, fastest Node.js SQLite binding, sync API matches our write-queue pattern [VERIFIED: npm registry] |
| @types/better-sqlite3 | 7.6.13 | TypeScript type definitions | Official community types, required for strict mode [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.2 (existing) | Test runner | Already in project; use for backend unit tests |
| node:fs | built-in | File migration (rename JSON) | Migration step only |
| node:path | built-in | DB path derivation from `persistencePath` | Derive `.db` from `.json` path |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | node:sqlite (Node.js 22 built-in) | Built-in is experimental/less mature; sync API less complete; user explicitly chose better-sqlite3 [CITED: CONTEXT.md D-01] |
| better-sqlite3 | sqlite3 (async) | Async API would complicate the sync `get()` cache pattern; worse performance |

**Installation:**
```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

**Version verification:**
- `better-sqlite3`: 12.9.0 (published 2026-04-19) [VERIFIED: npm registry]
- `@types/better-sqlite3`: 7.6.13 (published 2025-01-15) [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```
+--------------------------------------------------+
|  BotOrchestrator                                 |
|  +---------------------------------------------+ |
|  | ConversationStore                           | |
|  |  +---------------------------------------+  | |
|  |  | In-Memory Cache (Map)               |  | |
|  |  |  - Source of truth for get()        |  | |
|  |  |  - TTL eviction, LRU cap            |  | |
|  |  |  - Sliding window truncation        |  | |
|  |  +---------------------------------------+  | |
|  |  +---------------------------------------+  | |
|  |  | PersistenceBackend (pluggable)        |  | |
|  |  |  + JsonFileBackend  + SqliteBackend   |  | |
|  |  +---------------------------------------+  | |
|  +---------------------------------------------+ |
+--------------------------------------------------+
         |
         | init() on first mutation
         | save() after each mutation
         v
+--------------------------------------------------+
|  JsonFileBackend          |  SqliteBackend       |
|  - fs.readFile/writeFile  |  - better-sqlite3    |
|  - atomic rename (unix)   |  - WAL mode          |
|  - JSON parse/stringify   |  - prepared stmts    |
+--------------------------------------------------+
```

### Recommended Project Structure

```
src/
├── memory.ts                    # ConversationStore (cache + backend delegation)
├── memory.test.ts               # Existing tests + shared backend tests
├── persistence/
│   ├── index.ts                 # PersistenceBackend interface export
│   ├── json-file-backend.ts     # JsonFileBackend implementation
│   ├── sqlite-backend.ts        # SqliteBackend implementation
│   └── backends.test.ts         # Shared behavior tests for all backends
```

### Pattern 1: Pluggable Backend Interface
**What:** A minimal interface that `ConversationStore` delegates to for durable storage.
**When to use:** Any time the storage mechanism may vary (JSON file, SQLite, future MongoDB).
**Example:**
```typescript
// Source: inferred from CONTEXT.md D-12 through D-18
export interface PersistenceBackend {
  /** Load all conversation records into memory. Called once during init. */
  load(): Promise<Record<string, ConversationRecord>> | Record<string, ConversationRecord>;
  /** Persist all conversation records. Called after each mutation. */
  save(records: Record<string, ConversationRecord>): Promise<void> | void;
  /** Close any open resources (file handles, DB connections). */
  close(): Promise<void> | void;
}
```

### Pattern 2: better-sqlite3 Prepared Statements with Transaction
**What:** Use `db.prepare()` for repeated queries, wrap batch inserts in `db.transaction()`.
**When to use:** Migration batch insert, any multi-statement operation.
**Example:**
```typescript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
import Database from 'better-sqlite3';

const db = new Database('path.db');
db.pragma('journal_mode = WAL');

const insert = db.prepare(
  'INSERT INTO conversations (conversation_id, messages, last_accessed_at) VALUES (?, ?, ?)'
);

const insertMany = db.transaction((records) => {
  for (const record of records) {
    insert.run(record.id, JSON.stringify(record.messages), record.lastAccessedAt);
  }
});

insertMany(records);
```

### Pattern 3: Lazy Init with Async-First Backend
**What:** `ConversationStore.init()` remains async even though `better-sqlite3` is sync, because `PersistenceBackend.load()` returns `Promise | value` to accommodate future async backends.
**When to use:** Interface design that doesn't overfit to sync-only implementations.
**Example:**
```typescript
private async init(): Promise<void> {
  if (this.initialized) return;
  if (this.initPromise) return this.initPromise;
  this.initPromise = (async () => {
    const records = await this.backend.load();
    // ...hydrate cache...
    this.initialized = true;
  })();
  return this.initPromise;
}
```

### Pattern 4: Shared Test Behavior with Parameterized Backends
**What:** Run identical assertions against multiple backend implementations.
**When to use:** PERS-06 requirement for shared behavior assertions.
**Example:**
```typescript
// Source: vitest parameterized test pattern
import { describe, it, expect } from 'vitest';
import { JsonFileBackend } from './json-file-backend';
import { SqliteBackend } from './sqlite-backend';

const backends = [
  { name: 'JsonFileBackend', factory: (path: string) => new JsonFileBackend(path) },
  { name: 'SqliteBackend', factory: (path: string) => new SqliteBackend(path.replace('.json', '.db')) },
];

for (const { name, factory } of backends) {
  describe(`${name} shared behavior`, () => {
    it('round-trips conversation records', async () => {
      const backend = factory('/tmp/test.db');
      // ... assertions ...
    });
  });
}
```

### Anti-Patterns to Avoid
- **Opening DB in constructor:** May throw during instantiation before logger is available. Open lazily in `load()` or accept an optional logger.
- **Async SQLite libraries (sqlite3):** Would force `save()` to be async, complicating the already-async `saveQueue`. The sync `better-sqlite3` API fits the existing pattern.
- **Schema per conversation:** Do not create one table per conversation ID. Use a single `conversations` table with `conversation_id` as PRIMARY KEY.
- **Writing on every `get()`:** `get()` must remain fast and sync. Only update `last_accessed_at` in memory; persist on mutation (`append`, `clear`) only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite driver | Custom C++ binding or `node:sqlite` | `better-sqlite3` | Mature, well-tested, sync API, WAL support, transaction helpers |
| WAL mode file locking | fs-based lock files | `db.pragma('journal_mode = WAL')` | SQLite handles concurrency and crash recovery natively |
| JSON serialization of messages | Custom message format | `JSON.stringify()` / `JSON.parse()` | Messages are already `HistoryMessage[]` arrays; SQLite stores as TEXT |
| Test DB isolation | Shared DB file between tests | In-memory DB (`:memory:`) or temp file per test | `better-sqlite3` supports `:memory:` for fast, isolated tests |
| Migration retry / idempotency | Custom migration framework | Check `conversations` table row count | Single-table schema; idempotency = "skip if table has rows" |

**Key insight:** The persistence layer here is intentionally thin. `ConversationStore` owns caching, eviction, and sliding window logic. The backend only needs to serialize/deserialize the `Map` contents. Don't add ORM-like abstractions — they add complexity without value for a single-table schema.

## Runtime State Inventory

This is a refactor/migration phase. The following runtime state must be accounted for:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.bot-state.json` files at `PERSISTENCE_PATH` on deployed hosts | Migration: read JSON, filter TTL, insert to SQLite, rename JSON with `.migrated-{timestamp}` suffix |
| Live service config | None — all config is env-var based and loaded at startup | None |
| OS-registered state | None — no systemd units, Task Scheduler tasks, or pm2 registrations reference persistence path | None |
| Secrets/env vars | `PERSISTENCE_PATH` env var retains same meaning; new `PERSISTENCE_BACKEND` env var needed | Code edit: add `PERSISTENCE_BACKEND` to `.env.example` and `loadConfig()` |
| Build artifacts | `dist/` will need rebuild after adding `better-sqlite3` to `dependencies`; Docker image needs native compilation support | Dockerfile edit: add `python3 make g++` to builder stage for Alpine compilation |

**Nothing found in category:**
- Live service config: None — verified by inspection of `src/config/index.ts` (all config from `process.env`)
- OS-registered state: None — verified by codebase search (no systemd, pm2, launchd, or Task Scheduler references)

## Common Pitfalls

### Pitfall 1: Native Compilation Failure in Docker (Alpine Linux)
**What goes wrong:** `better-sqlite3` fails to install in `node:22-alpine` because Alpine uses `musl` libc and lacks Python, make, g++.
**Why it happens:** `better-sqlite3` is a native Node.js addon that compiles C++ code at install time. Alpine images are minimal and don't include build tools.
**How to avoid:** Add `python3 make g++` (or `build-base` + `python3`) to the builder stage in `Dockerfile`. Use multi-stage build so build tools don't end up in the production image.
**Warning signs:** `npm install` or `pnpm install` fails with `g++: not found` or `node-gyp` errors.

### Pitfall 2: Rollup External Missing for better-sqlite3
**What goes wrong:** Rollup bundles `better-sqlite3` into the output, causing runtime errors because native addons cannot be bundled.
**Why it happens:** `rollup.config.mjs` has an `external` array that must list all Node.js native modules and dependencies that shouldn't be bundled.
**How to avoid:** Add `'better-sqlite3'` to the `external` array in `rollup.config.mjs`.
**Warning signs:** Build succeeds but runtime throws `Cannot find module` or native addon loading errors.

### Pitfall 3: WAL Mode and Read-Only Filesystems
**What goes wrong:** If the deployment uses a read-only filesystem or tmpfs for the data directory, WAL mode creates `-wal` and `-shm` sidecar files that fail to write.
**Why it happens:** WAL mode requires write access to the directory containing the DB file for journal files.
**How to avoid:** Document that the persistence directory must be writable. The existing `loadConfig()` already ensures the directory exists with `fs.mkdirSync(dir, { recursive: true })`.
**Warning signs:** SQLite errors `SQLITE_READONLY` or `unable to open database file` at runtime.

### Pitfall 4: Migration Corruption Handling
**What goes wrong:** A corrupt `.bot-state.json` causes migration to throw, crashing startup.
**Why it happens:** `JSON.parse()` on a truncated file throws `SyntaxError`.
**How to avoid:** Wrap migration in try/catch per D-10. Log warning, start with empty DB, leave original file untouched.
**Warning signs:** Bot fails to start after enabling SQLite backend; logs show migration error.

### Pitfall 5: Test Isolation with SQLite
**What goes wrong:** Tests share a SQLite file on disk, causing flaky failures from leftover data.
**Why it happens:** Unlike JSON files which are deleted in `beforeEach`, SQLite `-wal` and `-shm` files may persist.
**How to avoid:** Use `:memory:` for SQLite backend tests, or use a unique temp file per test and call `backend.close()` in `afterEach`.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 6: SIGINT/SIGTERM Async Shutdown Race
**What goes wrong:** `process.exit(0)` is called before `bot.stop()` (and thus `store.close()`) completes, leaving the DB connection open and potentially corrupting WAL.
**Why it happens:** Signal handlers are sync by default; `process.exit()` terminates the event loop immediately.
**How to avoid:** Make the signal handler async: `await bot.stop(); process.exit(0)`. Ensure `bot.stop()` returns a Promise that resolves only after `store.close()` completes.
**Warning signs:** Intermittent SQLite corruption on restart; `-wal` file grows unbounded.

## Code Examples

### PersistenceBackend Interface
```typescript
// Source: inferred from CONTEXT.md decisions D-12 through D-18
import type { ConversationRecord } from '../memory';

export interface PersistenceBackend {
  load(): Promise<Record<string, ConversationRecord>> | Record<string, ConversationRecord>;
  save(records: Record<string, ConversationRecord>): Promise<void> | void;
  close(): Promise<void> | void;
}
```

### SqliteBackend Implementation (Core)
```typescript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
import Database from 'better-sqlite3';
import type { PersistenceBackend } from './index';
import type { ConversationRecord } from '../memory';

export class SqliteBackend implements PersistenceBackend {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private selectAllStmt: Database.Statement;
  private deleteAllStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT PRIMARY KEY,
        messages TEXT NOT NULL,
        last_accessed_at INTEGER NOT NULL
      )
    `);
    this.insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO conversations (conversation_id, messages, last_accessed_at) VALUES (?, ?, ?)'
    );
    this.selectAllStmt = this.db.prepare('SELECT conversation_id, messages, last_accessed_at FROM conversations');
    this.deleteAllStmt = this.db.prepare('DELETE FROM conversations');
  }

  load(): Record<string, ConversationRecord> {
    const rows = this.selectAllStmt.all() as Array<{
      conversation_id: string;
      messages: string;
      last_accessed_at: number;
    }>;
    const result: Record<string, ConversationRecord> = {};
    for (const row of rows) {
      result[row.conversation_id] = {
        messages: JSON.parse(row.messages),
        lastAccessedAt: row.last_accessed_at,
      };
    }
    return result;
  }

  save(records: Record<string, ConversationRecord>): void {
    const insert = this.insertStmt;
    const transaction = this.db.transaction(() => {
      this.deleteAllStmt.run();
      for (const [id, record] of Object.entries(records)) {
        insert.run(id, JSON.stringify(record.messages), record.lastAccessedAt);
      }
    });
    transaction();
  }

  close(): void {
    this.db.close();
  }
}
```

### JsonFileBackend (Extracted from existing code)
```typescript
// Source: src/memory.ts (existing implementation)
import fs from 'fs/promises';
import type { PersistenceBackend } from './index';
import type { ConversationRecord } from '../memory';

export class JsonFileBackend implements PersistenceBackend {
  constructor(private path: string) {}

  async load(): Promise<Record<string, ConversationRecord>> {
    const raw = await fs.readFile(this.path, 'utf-8');
    return JSON.parse(raw) as Record<string, ConversationRecord>;
  }

  async save(records: Record<string, ConversationRecord>): Promise<void> {
    const data = JSON.stringify(records);
    if (process.platform !== 'win32') {
      const tmpPath = `${this.path}.tmp`;
      await fs.writeFile(tmpPath, data, 'utf-8');
      await fs.rename(tmpPath, this.path);
    } else {
      await fs.writeFile(this.path, data, 'utf-8');
    }
  }

  async close(): Promise<void> {
    // No-op: fs handles are not held open
  }
}
```

### Async Shutdown in entry.ts
```typescript
// Source: inferred from CONTEXT.md D-14, D-15
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down bot...`);
  await bot.stop();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON file persistence (entire state rewritten each save) | SQLite with WAL mode (incremental, transactional) | Phase 5 (v1.1) | Better crash safety, smaller write amplification, concurrent read safety |
| Hard-coded persistence in `ConversationStore` | Pluggable `PersistenceBackend` interface | Phase 5 (v1.1) | Enables future backends (MongoDB, Redis) without changing `ConversationStore` |
| Sync `BotOrchestrator.stop()` | Async `stop()` with backend close | Phase 5 (v1.1) | Clean resource teardown, no WAL corruption on shutdown |

**Deprecated/outdated:**
- Direct JSON persistence in `ConversationStore`: being extracted to `JsonFileBackend`, but remains supported for backward compatibility.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `better-sqlite3` compiles successfully on `node:22-alpine` with `python3 make g++` installed | Environment Availability | Build failure in Docker; may need `build-base` metapackage or additional musl-specific flags |
| A2 | `@types/better-sqlite3` v7.6.13 is compatible with `better-sqlite3` v12.9.0 | Standard Stack | Type mismatches if types lag behind; can fall back to `skipLibCheck` or custom type declarations |
| A3 | WAL mode `-wal` and `-shm` files are handled correctly by Docker volume mounts if the persistence directory is mounted | Common Pitfalls | Data loss if volume mount doesn't include the sidecar files; should mount the directory, not the file |

## Open Questions

1. **Alpine build tool package names**
   - What we know: `python3`, `make`, `g++` are typically needed for `node-gyp` on Alpine.
   - What's unclear: Whether `node:22-alpine` needs `build-base` (metapackage) or individual packages suffice.
   - Recommendation: Try `apk add --no-cache python3 make g++` first in Dockerfile builder stage. If `better-sqlite3` prebuilt binaries are available for Node 22 + musl, compilation may be skipped entirely.

2. **better-sqlite3 prebuilt binaries for Node 22 + Alpine/musl**
   - What we know: `better-sqlite3` distributes prebuilt binaries for common platforms.
   - What's unclear: Whether Node 22 on Alpine/musl has a prebuilt binary available.
   - Recommendation: Attempt install without build tools first. If `node-gyp` compilation triggers, add build tools to Dockerfile.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 22.14.0 | — |
| npm | Package management | ✓ | 11.5.2 | — |
| pnpm | Package management | ✓ | 10.33.0 | — |
| Python | Native compilation (better-sqlite3) | ✓ | 3.13.3 | — |
| better-sqlite3 | SQLite backend | ✗ (not installed) | — | JsonFileBackend (default) |
| @types/better-sqlite3 | TypeScript types | ✗ (not installed) | — | skipLibCheck or custom types |

**Missing dependencies with no fallback:**
- None. JsonFileBackend is the default; SQLite is opt-in via `PERSISTENCE_BACKEND=sqlite`.

**Missing dependencies with fallback:**
- `better-sqlite3`: Not yet in `package.json`. Fallback is `JsonFileBackend` (default behavior).

## Validation Architecture

> `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is included for informational completeness but is not a gating factor.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | none detected (uses vitest defaults) |
| Quick run command | `npx vitest run src/persistence/backends.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERS-01 | Constructor accepts optional backend | unit | `vitest run src/memory.test.ts` | ❌ (needs new test) |
| PERS-02 | JsonFileBackend preserves existing behavior | unit | `vitest run src/persistence/backends.test.ts` | ❌ Wave 0 |
| PERS-03 | SqliteBackend with WAL mode | unit | `vitest run src/persistence/backends.test.ts` | ❌ Wave 0 |
| PERS-04 | get() remains synchronous | unit | `vitest run src/memory.test.ts` | ❌ (needs new assertion) |
| PERS-05 | JSON → SQLite migration on first startup | unit | `vitest run src/persistence/sqlite-backend.test.ts` | ❌ Wave 0 |
| PERS-06 | Shared behavior assertions across backends | unit | `vitest run src/persistence/backends.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/persistence/backends.test.ts` — shared behavior tests for `JsonFileBackend` and `SqliteBackend`
- [ ] `src/persistence/sqlite-backend.test.ts` — migration-specific tests (corrupt JSON, idempotency, TTL filtering)
- [ ] `src/memory.test.ts` — add test for constructor `backend` parameter override
- [ ] `src/bot/index.test.ts` — update for async `stop()` if tests call it
- [ ] `__tests__/bot.entry.smoke.test.ts` — update for async `stop()` in smoke test

## Security Domain

> This phase introduces a local SQLite database file. No network exposure, auth, or encryption changes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `conversation_id` is treated as opaque string; no SQL injection risk with parameterized prepared statements |
| V6 Cryptography | no | — |
| V10 Malicious Code | yes | `better-sqlite3` is a native addon; verify integrity via npm lockfile (`pnpm-lock.yaml`) |

### Known Threat Patterns for SQLite + Node.js

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection | Tampering | Prepared statements (`db.prepare()` with `?` placeholders) — never string-interpolate values into SQL |
| Path traversal via `persistencePath` | Tampering | `path.resolve()` already used in `loadConfig()`; ensure DB path is also resolved |
| WAL file info disclosure | Information Disclosure | Filesystem permissions on persistence directory; no encryption-at-rest per deferred scope |
| Native addon supply chain | Tampering | Pin exact version in `package.json`; verify `pnpm-lock.yaml` checksums |

## Sources

### Primary (HIGH confidence)
- better-sqlite3 API docs (GitHub) — Database constructor, prepared statements, transactions, WAL pragma, close method [CITED: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md]
- better-sqlite3 compilation docs — build-from-source flags, bundled SQLite version 3.53.0 [CITED: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md]
- npm registry — `better-sqlite3@12.9.0`, `@types/better-sqlite3@7.6.13` [VERIFIED: npm view]

### Secondary (MEDIUM confidence)
- Existing codebase — `src/memory.ts`, `src/bot/index.ts`, `src/bot/entry.ts`, `src/config/index.ts`, `rollup.config.mjs` [VERIFIED: codebase read]
- CONTEXT.md decisions D-01 through D-18 — locked architectural decisions [VERIFIED: file read]

### Tertiary (LOW confidence)
- Alpine Linux build requirements for `better-sqlite3` — no official docs found; inferred from general `node-gyp` + Alpine knowledge [ASSUMED: see Assumptions Log A1]
- `@types/better-sqlite3` compatibility with v12.9.0 — types package version (7.6.13) predates driver (12.9.0); likely compatible but not verified [ASSUMED: see Assumptions Log A2]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified from npm registry, API verified from official docs
- Architecture: HIGH — all decisions locked in CONTEXT.md, patterns clear from existing code
- Pitfalls: MEDIUM-HIGH — Alpine compilation is the main uncertainty; all other pitfalls derived from codebase analysis

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days; better-sqlite3 is stable but new Node.js versions may affect prebuilt binary availability)
