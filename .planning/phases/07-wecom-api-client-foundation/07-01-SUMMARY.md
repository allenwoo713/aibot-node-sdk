---
phase: 07-wecom-api-client-foundation
plan: 01
subsystem: api
tags: [wecom, axios, token-manager, typescript, ssrf-mitigation]

# Dependency graph
requires:
  - phase: 06-integration-deployment
    provides: Logger interface, atomic file write pattern from JsonFileBackend
provides:
  - TokenManager with in-memory + file cache, proactive refresh, fetch deduplication
  - WeComApiClient generic request<T>() with automatic token injection
  - WeCom API type definitions (TokenCache, GetTokenResponse, WeComApiError)
affects:
  - phase-09-document-reading
  - phase-10-schedule-management

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic file writes via temp + rename (non-Windows), guarded by platform check"
    - "Concurrent fetch deduplication via single Promise lock"
    - "Proactive token refresh with setTimeout scheduling"
    - "Generic request<T>() with automatic bearer token injection and single retry on expiry"
    - "SSRF endpoint validation: must start with / and contain no .."

key-files:
  created:
    - src/types/wecom-api.ts
    - src/token-manager.ts
  modified:
    - src/api.ts
    - src/client.ts
    - src/transport/http-transport.ts

key-decisions:
  - "Kept getAccessToken(corpid, corpsecret) as direct HTTP call separate from TokenManager cache — WS auth uses a different token flow than Open Platform APIs"
  - "Used private doRequest<T>(..., allowRetry) pattern to prevent infinite retry loops on token errors"
  - "Empty tokenFilePath ('') in legacy WSClient/HttpTransport call sites since they don't need Open Platform token persistence"

patterns-established:
  - "Token lifecycle: in-memory cache -> file cache -> fetch with deduplication -> proactive refresh"
  - "Error envelope handling: check errcode !== 0, classify 40001/40014 as token expiry, retry once after forceRefresh"

requirements-completed:
  - WECOM-01
  - WECOM-02

# Metrics
duration: 3min
completed: 2026-04-21
---

# Phase 07 Plan 01: WeCom API Client Foundation Summary

**TokenManager with proactive refresh and atomic file persistence, plus generic request<T>() wrapper with automatic access_token injection and single retry on expiry errors**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-21T05:30:56Z
- **Completed:** 2026-04-21T05:34:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created WeCom API type definitions (`TokenCache`, `GetTokenResponse`, `WeComApiError`)
- Built `TokenManager` with in-memory cache, file persistence, proactive refresh, and concurrent fetch deduplication
- Enhanced `WeComApiClient` with generic `request<T>()` that injects tokens automatically and retries once on 40001/40014
- Migrated `sendTextMessage()` to delegate through `request<T>()` without manual token passing
- Added SSRF mitigation via endpoint validation (`startsWith('/')` and no `..`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WeCom API types and TokenManager** - `cdb77cf` (feat)
2. **Task 2: Enhance WeComApiClient with generic request<T>()** - `19712da` (feat)

## Files Created/Modified

- `src/types/wecom-api.ts` - WeCom Open Platform API type definitions
- `src/token-manager.ts` - TokenManager class with cache, persistence, refresh, deduplication
- `src/api.ts` - Enhanced WeComApiClient with request<T>(), TokenManager integration, stop()
- `src/client.ts` - Updated WeComApiClient constructor call for new signature
- `src/transport/http-transport.ts` - Updated constructor call and sendTextMessage call for new signatures

## Decisions Made

- Kept `getAccessToken(corpid, corpsecret)` as a direct HTTP method separate from `TokenManager` because WebSocket authentication uses a different token endpoint/flow than the Open Platform `gettoken` API.
- Used `doRequest<T>(..., allowRetry: boolean)` private method to cleanly prevent infinite retry loops without adding stateful flags.
- Passed empty `tokenFilePath: ''` in legacy `WSClient` and `HttpTransport` call sites because they do not use Open Platform APIs and therefore do not need token file persistence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed broken call sites after WeComApiClient constructor signature change**
- **Found during:** Task 2 (Enhance WeComApiClient)
- **Issue:** `src/client.ts` and `src/transport/http-transport.ts` instantiated `WeComApiClient` with the old `(logger, timeout)` signature, causing TypeScript compilation errors. Additionally, `http-transport.ts` called `sendTextMessage(token, ...)` with the old signature.
- **Fix:** Updated both call sites to use the new constructor signature with `{ corpId, secret, tokenFilePath, timeout? }`. Updated `sendTextMessage` call to remove the `token` parameter. Passed empty `tokenFilePath: ''` for legacy code paths that don't need Open Platform token persistence.
- **Files modified:** `src/client.ts`, `src/transport/http-transport.ts`
- **Verification:** `npm run build` passes with zero errors
- **Committed in:** `19712da` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain backward compatibility with existing transport layers. No scope creep.

## Issues Encountered

- Rollup build failed immediately after rewriting `api.ts` due to constructor signature mismatch in two consumers. Fixed inline by updating call sites.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure_mitigated | src/token-manager.ts | Raw `access_token` never logged; only expiry timestamps are logged |
| threat_flag: information_disclosure_mitigated | src/token-manager.ts | Token file written with `mode: 0o600` on non-Windows platforms |
| threat_flag: tampering_mitigated | src/token-manager.ts | Proactive 5-minute refresh buffer + reactive retry on 40001/40014 in `api.ts` |
| threat_flag: spoofing_mitigated | src/api.ts | `request()` validates `endpoint.startsWith('/')` and `!endpoint.includes('..')` before request |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `WeComApiClient.request<T>()` is ready for all subsequent WeCom Open Platform API calls (document reading, schedule management, etc.)
- `TokenManager` lifecycle is self-contained and can be instantiated with a real `tokenFilePath` in future bot orchestrator integration

## Self-Check: PASSED

- [x] `src/types/wecom-api.ts` exists and exports `TokenCache`, `GetTokenResponse`, `WeComApiError`
- [x] `src/token-manager.ts` exists and exports `TokenManager`
- [x] `src/api.ts` exports `WeComApiClient` with `request<T>()`, `sendTextMessage()`, `stop()`
- [x] Commit `cdb77cf` exists in git log
- [x] Commit `19712da` exists in git log
- [x] Build passes (`npm run build` exits 0)

---
*Phase: 07-wecom-api-client-foundation*
*Completed: 2026-04-21*
