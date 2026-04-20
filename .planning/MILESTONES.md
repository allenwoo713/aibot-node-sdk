# Milestones

## v1.1 — AI Validation & Persistent Storage

**Shipped:** 2026-04-20
**Phases:** 4–6 (8 plans)
**Requirements:** 16/16 satisfied

### What Shipped

- AI API resilience: configurable retries, response validation, structured error classification, token tracking, input truncation
- Pluggable conversation persistence: JSON file backend + SQLite backend with WAL mode
- SDK public API exports all persistence classes (ConversationStore, PersistenceBackend, JsonFileBackend, SqliteBackend)
- Docker production image with better-sqlite3 native addon support and persistent data volume
- Full test suite: 98/98 tests across 15 test files (up from 61)
- Graceful shutdown with SQLite WAL flush on SIGINT/SIGTERM

### Key Decisions

- AI retry defaults: maxRetries=1, retryBaseDelayMs=2000, retryBackoffMultiplier=2, retryJitter=true
- Disable Anthropic SDK built-in retry to avoid double retry layers
- better-sqlite3 with WAL mode for production persistence
- Migration renames (not deletes) original JSON file for safety

### Known Deferred Items

- AIAPI-06 and PERS-05 verified by unit tests only (no E2E/UAT)
- Dockerfile production stage copies full node_modules including devDependencies
- gracefulShutdown lacks error handling for bot.stop() failures
- No Nyquist validation for any phase

### Full Archive

- [Roadmap](milestones/v1.1-ROADMAP.md)
- [Requirements](milestones/v1.1-REQUIREMENTS.md)
- [Audit](v1.1-MILESTONE-AUDIT.md)

---

## v1.0 — Async Persistence & HTTP Fallback

**Shipped:** (prior to v1.1)
**Phases:** 1–3

See [v1.0 archive](milestones/v1.0-ROADMAP.md).
