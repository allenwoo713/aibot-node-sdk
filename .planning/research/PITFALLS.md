# Pitfalls Research: AI Validation & Persistent Storage Migration

**Domain:** TypeScript Node.js SDK — adding AI API validation and migrating conversation persistence from JSON to database  
**Researched:** 2026-04-17  
**Confidence:** HIGH (codebase fully analyzed; SQLite/Anthropic pitfalls verified against official docs)

---

## Critical Pitfalls

### Pitfall 1: Losing the Write Queue Serialization When Moving to a Database

**What goes wrong:**  
Concurrent messages from the same or different conversations trigger overlapping DB writes, causing race conditions, lost updates, or duplicate records. SQLite `SQLITE_BUSY` errors bubble up and break the bot handler.

**Why it happens:**  
The current `ConversationStore` relies on `this.saveQueue = this.saveQueue.then(...)` to guarantee exactly one JSON write is in flight at a time. A naive DB migration replaces this with raw `await db.run(...)` inside `append()`, which removes serialization. SQLite WAL mode allows concurrent readers but only **one writer at a time**.

**How to avoid:**
- Keep an explicit per-connection (or per-process) write queue when using SQLite, or use `better-sqlite3` transactions which are synchronous and naturally atomic.
- If using an async driver (`sqlite3`, `bun:sqlite`), wrap mutations in a mutex/queue (e.g., `async-mutex` or a custom promise chain).
- Batch rapid sequential writes to the same conversation instead of flushing on every `append()`.

**Warning signs:**
- Intermittent `SQLITE_BUSY` in logs
- Test failures only under `Promise.all([...store.append(...)])`
- Duplicate or out-of-order messages in conversation history

**Phase to address:** Phase 01 — Persistent Storage Design & Migration

---

### Pitfall 2: WAL Mode Breaks on Networked or Multi-Host Storage

**What goes wrong:**  
The SQLite database corrupts or refuses to open when the Docker volume is moved to a network filesystem (NFS, EFS, CIFS) or when multiple replicas on different hosts try to share the same DB file.

**Why it happens:**  
SQLite WAL mode requires all processes to share the same `-shm` (shared-memory) file on the **same host**. WAL does not work over network filesystems. If the project later scales to Kubernetes with a ReadWriteMany PVC, the DB will fail.

**How to avoid:**
- Document that SQLite+WAL is **single-host only**.
- If Docker/Kubernetes scaling is needed, either:
  1. Run SQLite on a local `hostPath` or `emptyDir` with periodic backup, or
  2. Switch to MongoDB (or another network-capable DB) before multi-replica deployment.
- Always copy the `-wal` and `-shm` files together with the main DB during backups or migrations.

**Warning signs:**
- `database is locked` errors despite WAL mode
- Corruption after container restarts on different nodes
- Missing `-wal`/`-shm` files in volume snapshots

**Phase to address:** Phase 01 — Persistent Storage Design & Migration

---

### Pitfall 3: Anthropic Retry Logic Retries Non-Retryable Errors

**What goes wrong:**  
The bot wastes time and token budget retrying authentication failures (401), invalid parameters (400), or context-length overflows (413), instead of failing fast. This degrades UX and increases API costs.

**Why it happens:**  
The current `callWithRetry` only checks `status >= 500` and `429`. It does not classify 4xx client errors as non-retryable. Anthropic's SDK throws `AuthenticationError` (401), `BadRequestError` (400), and `OverloadedError` (529) with distinct error types.

**How to avoid:**
- Use the SDK's error classes (`Anthropic.APIError`) to classify:
  - **Never retry:** 400, 401, 403, 404, 422
  - **Retry with backoff:** 429, 500, 502, 503, 529
  - **Retry once immediately:** 500 on idempotent requests
- Implement exponential backoff with jitter for 429/5xx.
- Add a `maxRetries` config and surface the final error to the orchestrator instead of swallowing it.

**Warning signs:**
- Repeated 401s in logs with multiple attempts
- High latency on bad requests
- API costs rising despite obvious misconfiguration

**Phase to address:** Phase 02 — AI API Validation & Retry Policies

---

### Pitfall 4: Cost/Token Guards Are Added Too Late (After the API Call)

**What goes wrong:**  
A long conversation history or an unexpectedly verbose user message triggers a massive token spend. The guard runs only after receiving the response, so it cannot prevent the cost.

**Why it happens:**  
Teams often implement usage tracking by summing `usage.output_tokens` from the response object. This is reactive, not preventive. Anthropic charges for both input and output tokens.

**How to avoid:**
- Add a **pre-call token estimator** (e.g., `tiktoken` or `anthropic-tokenizer`) that counts input tokens before sending the request.
- Enforce `maxInputTokens` and `maxTotalTokens` limits in the orchestrator before calling `adapter.chat()`.
- Truncate history proactively using the same sliding-window logic, but measured in tokens rather than message count.
- Add a per-conversation or per-day spend cap using a lightweight counter in the store.

**Warning signs:**
- Sudden API bill spikes
- `max_tokens` exceeded errors after the request is sent
- Users pasting large documents into chat

**Phase to address:** Phase 02 — AI API Validation & Retry Policies

---

### Pitfall 5: Schema Validation Fails on Legitimate SDK Evolution

**What goes wrong:**  
A strict Zod (or similar) schema on the Anthropic response rejects new fields added by Anthropic in a minor SDK update, causing all API calls to be treated as errors even though the response is valid.

**Why it happens:**  
Developers validate the entire response object with `.strict()` or `.passthrough()` combined with an explicit deny-list. Anthropic occasionally adds new content block types or usage fields.

**How to avoid:**
- Validate only the fields the bot actually consumes (`content`, `usage.input_tokens`, `usage.output_tokens`).
- Use `.pick()` or partial schemas; never `.strict()` on the top-level response.
- Treat unknown content block types gracefully (filter instead of throwing).
- Pin the `@anthropic-ai/sdk` version and review changelogs before upgrading.

**Warning signs:**
- All AI responses suddenly marked as `error: true` after a dependency update
- Schema validation errors in logs with no functional failure

**Phase to address:** Phase 02 — AI API Validation & Retry Policies

---

### Pitfall 6: Database Connection Is Not Closed on SIGTERM/SIGINT

**What goes wrong:**  
The bot process exits during an in-flight DB write, leaving the SQLite WAL in an uncheckpointed state. On the next startup, recovery takes several seconds and blocks all new connections with an exclusive lock.

**Why it happens:**  
`BotOrchestrator.stop()` currently only stops the transport. It does not close the database connection. Docker sends `SIGTERM` on redeploy; the default handler calls `process.exit(0)` immediately.

**How to avoid:**
- Add a `close()` or `destroy()` method to the new DB-backed `ConversationStore`.
- Call `await store.close()` inside `BotOrchestrator.stop()` before exiting.
- In `entry.ts`, change `gracefulShutdown` to `async` and await `bot.stop()`.
- Register `beforeExit` handlers for test runners to prevent leaked handles in CI.

**Warning signs:**
- Slow startup after deployments
- `SQLITE_BUSY` or `database is locked` on first request after restart
- Vitest warnings about open handles

**Phase to address:** Phase 03 — Integration & Graceful Shutdown

---

### Pitfall 7: Tests Break Because They Assume Sync `get()` or File-System Side Effects

**What goes wrong:**  
After migration, `store.get()` becomes async (or requires DB initialization), causing dozens of existing tests to fail. Alternatively, tests spy on `fs.writeFile` and break when the store no longer uses the filesystem.

**Why it happens:**  
The current `ConversationStore.get()` is synchronous and returns `[]` for unknown conversations without any I/O. Tests rely on this behavior. The `memory.test.ts` suite also mocks `fsPromises.writeFile` to verify the write queue.

**How to avoid:**
- **Keep `get()` synchronous** by maintaining an in-memory cache in front of the DB (LRU + TTL, same as today). The DB becomes the backing store, not the primary source of truth for reads.
- If `get()` must become async, update the interface first in a dedicated compatibility phase and fix call sites incrementally.
- Replace `fs` spies with DB-specific assertions (e.g., query the test DB directly).
- Use an in-memory SQLite database (`:memory:`) for unit tests to keep them fast and isolated.

**Warning signs:**
- Mass test failures immediately after swapping the store implementation
- Timeouts in tests due to unexpected async behavior
- Tests passing individually but failing in parallel (shared DB state)

**Phase to address:** Phase 01 — Persistent Storage Design & Migration

---

### Pitfall 8: JSON-to-DB Migration Loses Existing User Data

**What goes wrong:**  
Existing deployments that upgrade to v1.1 lose all conversation history because the new DB-backed store starts empty and ignores the old `.bot-state.json` file.

**Why it happens:**  
The migration implements the new DB store but forgets to read and import the legacy JSON file on first startup.

**How to avoid:**
- Implement a **one-shot migration path** in the new store's constructor or `init()`:
  1. If the DB is empty and the JSON file exists, load it.
  2. Insert records into the DB.
  3. Rename the JSON file (e.g., `.bot-state.json.migrated`) so the step runs only once.
- Log the migration count for observability.
- Keep the migration code isolated so it can be removed in v1.2.

**Warning signs:**
- Users report "the bot forgot everything" after upgrade
- Empty DB but JSON file still present in the data directory

**Phase to address:** Phase 01 — Persistent Storage Design & Migration

---

### Pitfall 9: Docker Image Grows or Fails to Build Due to Native DB Dependencies

**What goes wrong:**  
Adding `better-sqlite3` breaks the Alpine-based Docker build because it requires Python, `make`, and `g++` to compile native bindings. The production image bloats or fails at `pnpm install`.

**Why it happens:**  
The current `Dockerfile` uses `node:22-alpine` and only installs production dependencies. `better-sqlite3` is a native Node-API module that needs compilation unless a prebuilt binary is available for the exact Node/OS/arch combination.

**How to avoid:**
- Option A: Add build tools in the builder stage only (`apk add --no-cache python3 make g++`), then copy `node_modules` to the production stage. This works but increases image size.
- Option B: Switch to `node:22-slim` (Debian-based) which has better prebuilt binary coverage for `better-sqlite3`.
- Option C: Use `libsql` / `@libsql/client` (Turso's SQLite fork) which has a pure-JS fallback and no native compilation.
- If choosing MongoDB, there is no native compilation issue, but the image size still grows slightly.

**Warning signs:**
- `gyp ERR! find Python` during Docker build
- CI build times increasing by minutes
- Runtime `Error: Cannot find module '../build/better_sqlite3.node'`

**Phase to address:** Phase 03 — Integration & Deployment

---

### Pitfall 10: Rate Limiting and DB Persistence Race in the Bot Orchestrator

**What goes wrong:**  
The bot replies to a user but crashes or restarts before the assistant's response is persisted. On reconnect, the user sees the reply but the bot has no memory of it, causing confusing follow-ups.

**Why it happens:**  
In `BotOrchestrator.handleTextMessage`, the assistant reply is appended to the store **after** `adapter.chat()` succeeds but **before** the message is streamed to the user. If the process dies between streaming and `store.append()`, the DB never records the assistant message.

**How to avoid:**
- Persist the assistant message **before** streaming it to the user, or at least before the first chunk.
- If the store append fails, log the error but still stream the reply (prefer availability over consistency).
- Consider a two-phase commit only if the chosen DB supports it; for SQLite, simply reorder the operations.

**Warning signs:**
- User: "You just said X" / Bot: "I don't remember saying X"
- Missing assistant messages in the DB after a crash

**Phase to address:** Phase 02 — AI API Validation & Retry Policies (orchestrator refinement)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip JSON migration and start DB empty | Faster implementation | Angry users who lose history | Never in a production SDK |
| Use async SQLite driver without a write queue | Keeps code async/await | Race conditions and `SQLITE_BUSY` | Never; use a mutex or sync driver |
| Add DB connection string only, no config abstraction | One less file to touch | Breaks backward compatibility of `BotConfig` | Never; keep `persistencePath` or add `dbUrl` alongside it |
| Validate Anthropic responses with `.strict()` Zod schema | Catches typos | Breaks on every SDK update | Never; use partial schemas |
| Retry all errors including 4xx | Simpler retry logic | Wastes money and delays real failures | Never; classify errors explicitly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic Messages API | Retry 401/403 errors | Fail fast; these are configuration errors |
| Anthropic Messages API | Ignore `usage` when counting costs | Sum `input_tokens + output_tokens` proactively; cache per conversation |
| SQLite WAL | Back up only the `.db` file | Always include `.db-wal` and `.db-shm` in backups; better yet, run `PRAGMA wal_checkpoint(TRUNCATE)` first |
| SQLite WAL | Open DB from multiple processes without mutex | Use WAL mode (good) but still serialize writes or use `better-sqlite3` transactions |
| Docker + SQLite | Mount a single file instead of the parent directory | Mount the entire data directory so `-wal` and `-shm` files are accessible |
| MongoDB (if chosen) | Use the default connection pool without timeout | Set `serverSelectionTimeoutMS` and `connectTimeoutMS` explicitly; handle connection failures gracefully |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| DB write on every `append()` | High latency under burst load; WAL grows rapidly | Batch writes or use an in-memory buffer with periodic flush | > 10 msgs/sec per conversation |
| No checkpointing in WAL mode | Disk usage grows unbounded; read performance degrades | Run `PRAGMA wal_checkpoint(TRUNCATE)` periodically or on graceful shutdown | Long-running process with constant writes |
| Synchronous DB queries in the bot handler | Event loop blocking; WebSocket heartbeat timeouts | Use async driver with a pool, or keep reads in-memory and DB writes backgrounded | > 100 concurrent conversations |
| Token counting on every message with a heavy tokenizer | CPU spikes; delayed replies | Cache token counts per message; approximate with character count for quick rejects | Large history windows |
| Loading full conversation history into memory for every reply | RSS growth; OOM on large deployments | Keep LRU cache capped; query only the last N messages from DB | > 1,000 active conversations |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Store Anthropic API key in the same DB as conversation history | Key exposure if DB is compromised | Keep the key in environment variables only; never persist it |
| Log full AI request/response bodies by default | PII leakage in log aggregators | Redact or truncate messages in default logging; enable full debug only via env flag |
| No input validation before sending to Anthropic | Prompt injection, excessive token costs | Sanitize and bound user input length; validate against max token budget |
| SQLite DB file world-readable in Docker | Container escape or volume snapshot leaks | Set `chmod 600` on the DB directory; run container as non-root |

---

## "Looks Done But Isn't" Checklist

- [ ] **DB Migration:** JSON data is imported and the old file is renamed, not just ignored
- [ ] **Write Queue:** Concurrent `append()` calls do not produce `SQLITE_BUSY` or duplicate rows
- [ ] **Graceful Shutdown:** `BotOrchestrator.stop()` awaits DB close and transport stop
- [ ] **Retry Policy:** 4xx errors fail fast; 5xx and 429 retry with backoff
- [ ] **Token Guards:** Input token count is checked *before* the API call, not after
- [ ] **Schema Validation:** Unknown fields in Anthropic responses are ignored, not rejected
- [ ] **Docker Build:** Image builds successfully with the chosen DB dependency
- [ ] **Test Isolation:** Unit tests use `:memory:` or temp files; no shared DB state between tests
- [ ] **WAL Files:** Backup/restore documentation mentions `.db-wal` and `.db-shm`
- [ ] **Backward Compatibility:** Existing `ConversationStore` API consumers do not break

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Lost JSON migration data | HIGH | Restore from backup; write a one-off migration script; apologize to users |
| `SQLITE_BUSY` in production | MEDIUM | Restart the process; add a write mutex; reduce write frequency |
| Anthropic 401s retried endlessly | LOW | Fix the API key; restart the bot; refund is not possible but cost stops |
| Docker build broken by native deps | LOW | Add build tools or switch base image; rebuild and redeploy |
| Tests broken by async `get()` | MEDIUM | Revert `get()` to sync with an in-memory cache; update tests gradually |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Losing write queue serialization | Phase 01 | Load test with `Promise.all([...store.append(...)])`; assert no `SQLITE_BUSY` |
| WAL mode on networked storage | Phase 01 | Document deployment constraints; verify single-host volume mounts |
| Retrying non-retryable Anthropic errors | Phase 02 | Unit tests mock each error class and assert retry count = 0 for 4xx |
| Cost guards added too late | Phase 02 | Test that oversized prompts are rejected before `messages.create` is called |
| Strict schema validation rejecting new fields | Phase 02 | Inject an unknown field into mock response; assert it is accepted |
| DB not closed on shutdown | Phase 03 | Send SIGTERM in E2E test; verify DB checkpoint and clean exit |
| Tests break due to sync/async mismatch | Phase 01 | Run full test suite; 61/61 pass plus new DB tests |
| JSON data loss on migration | Phase 01 | E2E test: start with JSON file, upgrade store, assert history preserved |
| Docker build failure from native deps | Phase 03 | CI builds the image successfully; `docker run` smoke test passes |
| Race between reply streaming and persistence | Phase 02 | Simulate crash after `adapter.chat()`; verify assistant message is in DB |

---

## Sources

- SQLite WAL documentation: https://www.sqlite.org/wal.html (verified: WAL requires same-host shared memory; `-wal`/`-shm` files must travel with DB)
- better-sqlite3 API docs: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md (verified: transaction functions do not work with async; raw COMMIT/ROLLBACK unsupported inside `.transaction()`)
- Anthropic SDK source analysis (`src/ai/api-adapter.ts`, `src/ai/api-adapter.test.ts`) — current retry logic only handles 500/429
- Codebase analysis (`src/memory.ts`, `src/memory.test.ts`, `src/bot/index.ts`, `src/bot/entry.ts`, `Dockerfile`) — identified sync `get()`, missing DB close, Alpine build constraints

---
*Pitfalls research for: aibot-node-sdk v1.1 — AI Validation & Persistent Storage*
*Researched: 2026-04-17*
