# Roadmap

## Completed Milestones

- [x] **[v1.0 — Async Persistence & HTTP Fallback](milestones/v1.0-ROADMAP.md)** — Replace sync I/O with async persistence and add HTTP fallback transport
- [x] **[v1.1 — AI Validation & Persistent Storage](milestones/v1.1-ROADMAP.md)** — Strengthen AI call handling with validation, retries, error classification; add pluggable SQLite persistence

## Current Milestone

- [x] **[v1.2 — WeCom Ecosystem Extension](ROADMAP.md)** — WeCom API client, Docker Compose, document reading, schedule management

## Phases

- [x] **Phase 7: WeCom API Client Foundation** — SDK obtains, caches, and auto-refreshes access_token; exposed in public API
- [x] **Phase 8: Docker Compose Deployment** — One-command local deployment with health checks and persistent data volumes
- [x] **Phase 9: Document Reading Integration** — Bot handles `/文档` command to download, analyze, and summarize WeCom micro-documents
- [x] **Phase 10: Schedule Management Integration** — Bot handles `/日程 创建` and `/日程 列表` commands with attendee mapping
- [x] **Phase 11: Testing & Integration** — Unit and integration tests cover all new v1.2 features

---

## Phase Details

### Phase 7: WeCom API Client Foundation
**Goal**: SDK consumers and the bot can reliably call WeCom Open Platform APIs with automatic authentication and error recovery.
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: WECOM-01, WECOM-02, WECOM-03, WECOM-04
**Success Criteria** (what must be TRUE):
  1. Developer can import and instantiate the WeCom API client from SDK public exports to call any Open Platform endpoint
  2. API client automatically obtains and caches `access_token` on first use without manual intervention
  3. API client transparently refreshes `access_token` before expiry without failing the original request
  4. Token expired/invalid errors (40014, 40001) trigger automatic retry with a fresh token, succeeding on retry
**Plans**: 2 plans (07-01, 07-02) — Complete

### Phase 8: Docker Compose Deployment
**Goal**: Developers can deploy the bot service locally with a single command, health monitoring, and persistent conversation data.
**Depends on**: Phase 7
**Requirements**: DOCKER-01, DOCKER-02, DOCKER-03, DOCKER-04
**Success Criteria** (what must be TRUE):
  1. Developer can start the complete bot service with `docker compose up` from the project root
  2. Container health check reports healthy when the bot service is running and responsive
  3. Conversation persistence data survives `docker compose down` followed by `docker compose up` via named volume
  4. Environment variables are loaded from `.env` file without manual `export`
**Plans**: 3 plans — Complete
- [x] 08-01-PLAN.md — HealthServer implementation (`src/health.ts`, `src/health.test.ts`)
- [x] 08-02-PLAN.md — Bot integration and Compose configuration (`src/bot/index.ts`, `src/bot/entry.ts`, `compose.yml`)
- [x] 08-03-PLAN.md — Dockerfile health check and gitignore (`Dockerfile`, `.gitignore`)

### Phase 9: Document Reading Integration
**Goal**: Users can ask the bot to analyze WeCom micro-documents via a simple chat command.
**Depends on**: Phase 7
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, BOT-01, BOT-02, BOT-04
**Success Criteria** (what must be TRUE):
  1. User can send `/文档 <document-name>` and the bot acknowledges the request
  2. Bot downloads the specified micro-document content from WeCom via Open Platform API
  3. Bot passes downloaded document content to Claude and replies with a structured summary or answers specific questions
  4. Bot provides a helpful error message when the document name is missing, invalid, or the document is not found
  5. Command handling preserves existing rate limiting and conversation memory behavior
**Plans**: 3 plans — Complete
- [x] 09-01-PLAN.md — WeCom API client extension for document reading (`src/types/wecom-api.ts`, `src/api.ts`)
- [x] 09-02-PLAN.md — Command router and bot integration (`src/bot/commands/index.ts`, `src/bot/index.ts`)
- [x] 09-03-PLAN.md — Tests (`src/bot/commands/index.test.ts`, `src/bot/index.test.ts`)

### Phase 10: Schedule Management Integration
**Goal**: Users can create and query WeCom schedules via natural-language bot commands.
**Depends on**: Phase 7, Phase 9
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, BOT-03
**Success Criteria** (what must be TRUE):
  1. User can send `/日程 创建 <description>` and the bot creates a schedule in WeCom
  2. Created schedule includes the command sender as the attendee
  3. Bot confirms schedule creation with a summary showing title, time, and attendees
  4. User can send `/日程 列表` and the bot replies with upcoming schedules
  5. Messages that are not `/文档` or `/日程` commands fall back to normal AI chat
**Plans**: 4 plans — Complete
- [x] 10-01-PLAN.md — WeCom API types + createSchedule/getSchedule methods (`src/types/wecom-api.ts`, `src/api.ts`)
- [x] 10-02-PLAN.md — ScheduleStore + date-parser (`src/bot/schedule-store.ts`, `src/bot/date-parser.ts`)
- [x] 10-03-PLAN.md — Command router refactor + schedule handlers (`src/bot/commands/index.ts`, `src/bot/commands/schedule.ts`, `src/bot/index.ts`)
- [x] 10-04-PLAN.md — Unit tests for all new code (`src/bot/*.test.ts`, `src/bot/commands/*.test.ts`)

### Phase 11: Testing & Integration
**Goal**: All new v1.2 features have automated test coverage that catches regressions.
**Depends on**: Phase 7, Phase 8, Phase 9, Phase 10
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `access_token` refresh and retry logic is verified by unit tests with mocked HTTP
  2. Document download and analysis end-to-end flow is covered by integration tests
  3. Schedule create and query commands are covered by integration tests
  4. Command parser and router logic is covered by unit tests
**Plans**: 3 plans — Complete
- [x] 11-01-PLAN.md — WeComApiClient method tests (`src/api.test.ts`)
- [x] 11-02-PLAN.md — E2E document command test (`__tests__/bot.document.e2e.test.ts`)
- [x] 11-03-PLAN.md — E2E schedule command test (`__tests__/bot.schedule.e2e.test.ts`)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 4. AI API Validation & Reliability | v1.1 | 3/3 | Complete | 2026-04-19 |
| 5. Persistent Conversation Storage | v1.1 | 3/3 | Complete | 2026-04-19 |
| 6. Integration & Deployment | v1.1 | 2/2 | Complete | 2026-04-20 |
| 7. WeCom API Client Foundation | v1.2 | 2/2 | Complete | 2026-04-21 |
| 8. Docker Compose Deployment | v1.2 | 3/3 | Complete | 2026-04-22 |
| 9. Document Reading Integration | v1.2 | 3/3 | Complete | 2026-04-23 |
| 10. Schedule Management Integration | v1.2 | 4/4 | Complete | 2026-04-24 |
| 11. Testing & Integration | v1.2 | 3/3 | Complete | 2026-04-24 |

---

## Coverage Validation

| Requirement | Phase |
|-------------|-------|
| WECOM-01 | 7 |
| WECOM-02 | 7 |
| WECOM-03 | 7 |
| WECOM-04 | 7 |
| DOCKER-01 | 8 |
| DOCKER-02 | 8 |
| DOCKER-03 | 8 |
| DOCKER-04 | 8 |
| DOC-01 | 9 |
| DOC-02 | 9 |
| DOC-03 | 9 |
| DOC-04 | 9 |
| SCHED-01 | 10 |
| SCHED-02 | 10 |
| SCHED-03 | 10 |
| SCHED-04 | 10 |
| BOT-01 | 9 |
| BOT-02 | 9 |
| BOT-03 | 10 |
| BOT-04 | 9 |
| TEST-01 | 11 |
| TEST-02 | 11 |
| TEST-03 | 11 |
| TEST-04 | 11 |

**Mapped:** 24/24
**Orphans:** None

---

*Last updated: 2026-04-24*
