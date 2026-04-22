---
phase: 08-docker-compose-deployment
plan: 02
subsystem: bot-lifecycle
requires: [08-01]
provides: ["src/bot/index.ts fatal-error tracking", "src/bot/entry.ts HealthServer integration", "compose.yml"]
affects: ["Dockerfile HEALTHCHECK", "compose.yml healthcheck", "BotOrchestrator.isHealthy()"]
tech-stack:
  added: []
  patterns:
    - "BotOrchestrator fatal-error state tracking via transport error events"
    - "HealthServer lifecycle co-managed in entry.ts alongside BotOrchestrator"
    - "Docker Compose v2 with bind mount persistence and wget health checks"
key-files:
  created:
    - compose.yml
  modified:
    - src/bot/index.ts
    - src/bot/entry.ts
decisions:
  - "BotOrchestrator tracks fatal errors via _fatalError flag set by WSAuthFailureError / WSReconnectExhaustedError"
  - "HealthServer started after bot.start() and stopped after bot.stop() in gracefulShutdown"
  - "compose.yml uses :? fail-fast validation for required env vars"
metrics:
  duration: "8 minutes"
  completed_date: "2026-04-22"
---

# Phase 8 Plan 02: HealthServer Integration & Docker Compose Summary

**One-liner:** Wire HealthServer into BotOrchestrator lifecycle, add fatal-error tracking, and create `compose.yml` for one-command `docker compose up` deployment.

## What Was Built

### `src/bot/index.ts`

- Added `_fatalError` private boolean field (initially `false`)
- Updated transport `error` event handler to set `_fatalError = true` when error is `WSAuthFailureError` or `WSReconnectExhaustedError`
- Added public `isHealthy(): boolean` method returning `!this._fatalError`
- Imported `WSAuthFailureError` and `WSReconnectExhaustedError` from `../types`

### `src/bot/entry.ts`

- Imported `HealthServer` from `../health`
- Instantiated `HealthServer` with `() => bot.isHealthy()` callback after `bot.start()`
- Started `HealthServer` on port 3000
- Updated `gracefulShutdown` to `await healthServer.stop()` after `await bot.stop()`

### `compose.yml`

- Service `bot` builds from local Dockerfile (`build: .`)
- Exposes port `3000:3000`
- Loads environment from `.env` via `env_file: [.env]`
- Required variables use `:?` fail-fast validation:
  - `BOT_ID=${BOT_ID:?BOT_ID is required}`
  - `SECRET=${SECRET:?SECRET is required}`
  - `ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}`
- Bind mount `./data:/app/data` for persistence across container restarts
- Restart policy: `unless-stopped`
- Health check uses Alpine-safe `wget` with `start_period: 15s`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

No new threat surface introduced beyond the planned `/health` endpoint (implemented in Plan 01). The integration follows the threat model mitigations:

- T-08-04 (Information Disclosure): `env_file: [.env]` keeps secrets out of the compose file; `:?` validation prevents silent misconfiguration.
- T-08-05 (Denial of Service): Bind mount permission issues accepted per threat model — container runs as root in `node:22-alpine`.
- T-08-06 (Tampering): Host `./data` writable by container is intentional for persistence; host admin controls access.

## Self-Check: PASSED

- [x] `src/bot/index.ts` contains `_fatalError`, `isHealthy()`, and imports for `WSAuthFailureError` / `WSReconnectExhaustedError`
- [x] `src/bot/entry.ts` imports `HealthServer`, starts it on port 3000, and stops it in `gracefulShutdown`
- [x] `compose.yml` exists with all required fields per acceptance criteria
- [x] `grep -c "image:" compose.yml` equals 0
- [x] All unit tests pass (`src/bot/index.test.ts` + `src/health.test.ts` = 14 tests)
- [x] TypeScript compilation passes (`npx tsc --noEmit`)
- [x] Commits `4de1478`, `456c60c`, `e2d6444` exist
