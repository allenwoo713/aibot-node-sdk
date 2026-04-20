---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: WeCom Ecosystem Extension
status: Roadmap defined
last_updated: "2026-04-20T17:30:00.000Z"
last_activity: "Roadmap created for v1.2 (phases 7-11)"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

**Project**: aibot-node-sdk
**Core Value**: Developers can integrate a production-ready AI bot into WeCom with minimal setup, while the SDK provides reliable real-time messaging and extensible architecture.
**Current Focus**: Planning v1.2 roadmap (phases 7–11)

## Current Position

Phase: Not started (roadmap defined)
Milestone: v1.2 (planning)
**Status**: Roadmap defined, awaiting approval
**Progress**: 0%

```
[░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%
```

## Accumulated Context

### Decisions

- Async persistence keeps JSON file format to minimize migration risk for existing deployments
- HTTP fallback uses WeCom official push + callback APIs
- Keep `ws` as primary transport, HTTP as fallback
- v1.1 roadmap structured into 3 phases: AI API Validation (4), Persistent Storage (5), Integration & Deployment (6)
- AI retry defaults: maxRetries=1, retryBaseDelayMs=2000, retryBackoffMultiplier=2, retryJitter=true
- maxInputTokens=8192 with character-count/4 heuristic for truncation
- Fallback messages are in Chinese to match existing UX
- Disable Anthropic SDK built-in retry (maxRetries: 0) to avoid double retry layers
- PersistenceBackend interface isolates storage logic from ConversationStore
- better-sqlite3 with WAL mode for production SQLite persistence
- Migration renames (not deletes) original JSON file for safety
- FallbackTransport dedup key = `${msgid}:${eventName}` to fix cross-transport event dropping
- v1.2 adopts fixed-command mode (not function calling) for WeCom API integration — simpler, more reliable
- v1.2 roadmap: 5 phases (7–11) covering WeCom API client, Docker Compose, document reading, schedule management, and test coverage

### TODOs

- [ ] Approve v1.2 roadmap
- [ ] Execute Phase 7: WeCom API Client Foundation
- [ ] Execute Phase 8: Docker Compose Deployment
- [ ] Execute Phase 9: Document Reading Integration
- [ ] Execute Phase 10: Schedule Management Integration
- [ ] Execute Phase 11: Testing & Integration

### Blockers

None.

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-04-20:

| Category | Item | Status |
|----------|------|--------|
| test-coverage | AIAPI-06 E2E/UAT for maxInputTokens truncation | deferred |
| test-coverage | PERS-05 E2E/UAT for JSON->SQLite migration | deferred |
| devops | Dockerfile production stage copies full node_modules (devDependencies included) | deferred |
| reliability | gracefulShutdown lacks error handling for bot.stop() failures | deferred |
| process | No Nyquist validation for any phase | deferred |

## Session Continuity

**Last updated**: 2026-04-20
**Last action**: Roadmap created for v1.2 (phases 7–11)
**Next action**: Approve roadmap and begin `/gsd-plan-phase 7`
