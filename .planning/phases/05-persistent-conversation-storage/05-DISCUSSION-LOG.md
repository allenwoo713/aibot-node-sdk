# Phase 5: Persistent Conversation Storage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 5-persistent-conversation-storage
**Areas discussed:** SQLite library choice, Backend selection mechanism, Migration behavior, Backend lifecycle / shutdown

---

## SQLite Library Choice

| Option | Description | Selected |
|--------|-------------|----------|
| `node:sqlite` (built-in) | Node 22 built-in module. Zero dependencies, no native compilation, async API. | |
| `better-sqlite3` | Fast synchronous API. Requires native compilation (node-gyp), adds build complexity. | ✓ |
| `sqlite3` | Traditional async callback-based wrapper. Requires native compilation. Older API. | |

**User's choice:** `better-sqlite3`
**Notes:** User values the maturity and synchronous API of `better-sqlite3` over the zero-dependency appeal of `node:sqlite`. The sync API aligns well with keeping `get()` synchronous via the in-memory cache.

---

## Backend Selection Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| BotConfig + env var | Add `persistenceBackend` to `BotConfig`, load from `PERSISTENCE_BACKEND` env var. Also allow constructor injection. | ✓ |
| Constructor injection only | No config field. Consumers pass a `PersistenceBackend` instance to `ConversationStore`. | |
| Both — env for built-ins, injection for custom | `PERSISTENCE_BACKEND` env var selects built-in backend. Constructor injection overrides. | |

**User's choice:** BotConfig + env var
**Notes:** Matches the existing environment-based configuration pattern (`getEnv()` / `getEnvInt()`). Keeps simple use cases simple while still supporting pluggable backends via constructor injection.

---

## Migration Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Rename with timestamp | Rename to `.bot-state.json.migrated-{timestamp}` after successful import. | ✓ |
| Keep as-is, don't touch | Read and import, but leave original file untouched. | |
| Delete after success | Remove JSON file after successful migration. | |
| Keep as .bot-state.json.backup | Simple rename to `.bot-state.json.backup`. | |

**User's choice:** Rename with timestamp
**Notes:** Timestamp format agreed as `YYYYMMDD-HHMMSS` local time. Provides recoverable backup without clutter. Migration only happens when DB is empty and JSON file exists.

---

## Backend Lifecycle / Shutdown

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — backend needs close() | `PersistenceBackend` has `close()`. `ConversationStore.close()` delegates. `BotOrchestrator.stop()` becomes async. `entry.ts` awaits shutdown. | ✓ |
| No — auto-cleanup on exit | `better-sqlite3` handles cleanup automatically. Keep `stop()` sync. | |

**User's choice:** Yes — backend needs close()
**Notes:** This decision cascades into Phase 6 (Integration) where `BotOrchestrator.stop()` must become async and `entry.ts` graceful shutdown must await cleanup. Clean resource management is preferred over relying on process exit.

---

## Claude's Discretion

- Exact `better-sqlite3` API usage (prepared statements vs. direct exec)
- SQLite connection pooling (single connection is acceptable for this single-process SDK)
- Error handling during `close()` (log warnings, don't throw)
- Test helper for SQLite backend isolation

## Deferred Ideas

- MongoDB backend (OOS-01)
- Encryption-at-rest inside the SDK (OOS-05)
