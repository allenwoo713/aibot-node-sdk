# Roadmap

## Completed Milestones

- [x] **[v1.0 — Async Persistence & HTTP Fallback](milestones/v1.0-ROADMAP.md)** — Replace sync I/O with async persistence and add HTTP fallback transport for WeCom messaging

## Current Milestone: v1.1 — AI Validation & Persistent Storage

### Phases

- [x] **Phase 4: AI API Validation & Reliability** — Strengthen AI call handling with response validation, configurable retries, error classification, token tracking, and cost guards
- [x] **Phase 5: Persistent Conversation Storage** — Replace JSON file persistence with a pluggable backend system including SQLite with WAL mode, while preserving backward compatibility
- [ ] **Phase 6: Integration & Deployment** — Wire graceful shutdown, async entry handling, Docker builds, and maintain test coverage across the milestone

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. AI API Validation & Reliability | 3/3 | Complete | 2026-04-19 |
| 5. Persistent Conversation Storage | 3/3 | Complete | 2026-04-19 |
| 6. Integration & Deployment | 0/TBD | Not started | — |

## Phase Details

### Phase 4: AI API Validation & Reliability
**Goal**: Developers can rely on robust AI call handling with validation, retries, and cost guards
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: AIAPI-01, AIAPI-02, AIAPI-03, AIAPI-04, AIAPI-05, AIAPI-06
**Success Criteria** (what must be TRUE):
  1. User receives a validated fallback response when the upstream AI API returns malformed or empty content blocks
  2. User can configure retry policies (maxRetries, base delay, backoff multiplier, jitter) via BotConfig
  3. Retry logic only retries on retryable errors (429, 5xx, timeout) and fails fast on non-retryable errors (400, 401, 403, 404, 422)
  4. SDK surfaces structured error classification (retryable, rate_limited, auth_invalid, unknown) for operator observability
  5. Token usage is tracked and forwarded in ChatResult when the API returns it
  6. Input payloads exceeding maxInputTokens are rejected or truncated before the API call to prevent runaway costs
**Plans**: 3 plans (complete)

Plan list:
- [x] 04-01-PLAN.md — Config contracts and ChatResult extension
- [x] 04-02-PLAN.md — Core adapter implementation (retry, validation, classification, truncation)
- [x] 04-03-PLAN.md — Bot orchestrator integration and full test suite verification

### Phase 5: Persistent Conversation Storage
**Goal**: Developers can replace JSON file persistence with a robust SQLite-backed store without breaking existing consumers
**Depends on**: Nothing (parallel to Phase 4)
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04, PERS-05, PERS-06
**Success Criteria** (what must be TRUE):
  1. `ConversationStore` constructor accepts an optional pluggable `PersistenceBackend` while defaulting to existing JSON behavior
  2. Existing JSON persistence logic is extracted into `JsonFileBackend` without behavior changes
  3. A new `SqliteBackend` implements `PersistenceBackend` using SQLite with WAL mode and serialized writes
  4. `ConversationStore.get()` remains synchronous by keeping an in-memory LRU cache in front of the backend
  5. Existing `.bot-state.json` files are automatically migrated into SQLite on first startup when the DB is empty
  6. All persistence backends are covered by dedicated unit tests and run through shared behavior assertions
**Plans**: 3 plans (complete)

Plan list:
- [x] 05-01-PLAN.md — PersistenceBackend interface + JsonFileBackend + SqliteBackend
- [x] 05-02-PLAN.md — Refactor ConversationStore with pluggable backend
- [x] 05-03-PLAN.md — Async lifecycle wiring + comprehensive tests

### Phase 6: Integration & Deployment
**Goal**: The bot service shuts down gracefully and deploys reliably with the new SQLite dependency
**Depends on**: Phase 4, Phase 5
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04
**Success Criteria** (what must be TRUE):
  1. `BotOrchestrator.stop()` closes the persistence backend connection before exiting
  2. `entry.ts` graceful shutdown is async and awaits `bot.stop()` on SIGINT/SIGTERM
  3. Docker image builds successfully with the chosen SQLite dependency
  4. Full test suite (existing + new) passes; coverage does not regress below current levels
**Plans**: TBD
