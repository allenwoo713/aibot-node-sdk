# Milestone v1.1 Requirements

## Active

### AI-API — AI API Validation

- [ ] **AIAPI-01**: User receives a validated AI response even when the upstream API returns malformed or empty content blocks
- [ ] **AIAPI-02**: User can configure retry policy (maxRetries, base delay, backoff multiplier, jitter) via `BotConfig`
- [ ] **AIAPI-03**: Retry logic only retries retryable errors (429, 5xx, timeout) and fails fast on non-retryable errors (400, 401, 403, 404, 422)
- [ ] **AIAPI-04**: SDK surfaces structured error classification (retryable, rate_limited, auth_invalid, unknown) for operator observability
- [ ] **AIAPI-05**: Token usage is tracked and forwarded in `ChatResult` when the API returns it
- [ ] **AIAPI-06**: Input payloads exceeding `maxInputTokens` are rejected or truncated before the API call to prevent runaway costs

### PERS — Persistent Conversation Storage

- [ ] **PERS-01**: `ConversationStore` constructor accepts an optional pluggable `PersistenceBackend` while defaulting to existing JSON behavior
- [ ] **PERS-02**: Existing JSON persistence logic is extracted into `JsonFileBackend` without behavior changes
- [ ] **PERS-03**: A new `SqliteBackend` implements `PersistenceBackend` using SQLite with WAL mode and serialized writes
- [ ] **PERS-04**: `ConversationStore.get()` remains synchronous by keeping an in-memory LRU cache in front of the backend
- [ ] **PERS-05**: Existing `.bot-state.json` files are automatically migrated into SQLite on first startup when the DB is empty
- [ ] **PERS-06**: All persistence backends are covered by dedicated unit tests and run through shared behavior assertions

### INTEG — Integration & Deployment

- [ ] **INTEG-01**: `BotOrchestrator.stop()` closes the persistence backend connection before exiting
- [ ] **INTEG-02**: `entry.ts` graceful shutdown is async and awaits `bot.stop()` on SIGINT/SIGTERM
- [ ] **INTEG-03**: Docker image builds successfully with the chosen SQLite dependency
- [ ] **INTEG-04**: Full test suite (existing + new) passes; coverage does not regress below current levels

## Out of Scope

| ID | Item | Reason |
|----|------|--------|
| OOS-01 | MongoDB backend implementation | SQLite satisfies single-node SDK needs; MongoDB remains a future differentiator |
| OOS-02 | Real-time streaming token validation | Complexity outweighs reliability gain for v1.1 |
| OOS-03 | Per-conversation budget ceiling / cost tracking across days | Requires product decisions and cumulative accounting beyond v1.1 scope |
| OOS-04 | Built-in prompt injection detection / content moderation | Rely on Anthropic safety filters; out of SDK scope |
| OOS-05 | Encryption-at-rest inside the SDK | Operational concern; rely on filesystem/DB-native protections |
| OOS-06 | Automatic model fallback across vendors | `AiBackend` interface already allows consumers to plug their own |

## Future

- MongoDB backend adapter for multi-replica deployments
- Per-request and per-conversation budget ceiling with cumulative tracking
- Input token estimation using a lightweight tokenizer heuristic
- Observability hooks (`onRetry`, `onValidationFail`, `onTokenUsage`)
- Conversation export / import utilities

## Traceability

| Requirement | Phase | Plan |
|-------------|-------|------|
| AIAPI-01 | — | — |
| AIAPI-02 | — | — |
| AIAPI-03 | — | — |
| AIAPI-04 | — | — |
| AIAPI-05 | — | — |
| AIAPI-06 | — | — |
| PERS-01 | — | — |
| PERS-02 | — | — |
| PERS-03 | — | — |
| PERS-04 | — | — |
| PERS-05 | — | — |
| PERS-06 | — | — |
| INTEG-01 | — | — |
| INTEG-02 | — | — |
| INTEG-03 | — | — |
| INTEG-04 | — | — |

---
*Last updated: 2026-04-17 — Milestone v1.1 requirements defined*
