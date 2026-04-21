---
phase: 07-wecom-api-client-foundation
plan: 02
subsystem: api
tags: [wecom, api-client, token-manager, axios, vitest]

requires:
  - phase: 07-wecom-api-client-foundation
    provides: WeComApiClient with generic request<T>(), TokenManager with proactive refresh and file persistence

provides:
  - WSClient constructs WeComApiClient with corpId, secret, and tokenFilePath
  - Token file path defaults to .bot-token.json in cwd when not specified
  - SDK public API exports WeComApiClient and WeCom API types (TokenCache, GetTokenResponse, WeComApiError)
  - Unit tests covering token deduplication, persistence, proactive refresh, reactive retry, and error handling

affects:
  - 08-docker-compose-deployment
  - 09-document-reading-integration
  - 10-schedule-management-integration

tech-stack:
  added: []
  patterns:
    - "WSClient lifecycle: apiClient.stop() called in disconnect() to prevent timer leaks"
    - "Token file path resolution: options.tokenFilePath || path.resolve(process.cwd(), '.bot-token.json')"

key-files:
  created:
    - src/api.test.ts - 15 unit tests for TokenManager and WeComApiClient
  modified:
    - src/types/config.ts - Added corpId?, agentId?, tokenFilePath? to WSClientOptions
    - src/client.ts - Integrated WeComApiClient construction with path resolution and stop() on disconnect
    - src/index.ts - Exported TokenCache, GetTokenResponse, WeComApiError from public API

key-decisions:
  - "corpId defaults to botId when not provided, matching existing WSClient credential pattern"
  - "tokenFilePath defaults to .bot-token.json in cwd, consistent with ConversationStore persistence naming"

patterns-established:
  - "SDK options interface extension: add optional fields to WSClientOptions without breaking existing consumers"
  - "Lifecycle pairing: apiClient.stop() mirrors wsManager.disconnect() in WSClient.disconnect()"

requirements-completed: [WECOM-03, WECOM-04]

metrics:
  duration: 28min
  completed: "2026-04-21"
---

# Phase 7 Plan 2: WSClient Integration and Unit Tests Summary

**WSClient wires enhanced WeComApiClient with configurable corpId/secret/tokenFilePath, public API exports WeCom API types, and 15 comprehensive unit tests validate token lifecycle and reactive retry**

## Performance

- **Duration:** 28 min
- **Started:** 2026-04-21T13:45:00Z
- **Completed:** 2026-04-21T14:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- WSClientOptions extended with `corpId`, `agentId`, `tokenFilePath` optional fields
- WSClient constructor computes default token file path and passes credentials to WeComApiClient
- `disconnect()` calls `apiClient.stop()` to clear token refresh timer and prevent leaks
- Public SDK exports include `TokenCache`, `GetTokenResponse`, `WeComApiError` types
- 15 unit tests covering concurrent deduplication, file persistence, proactive refresh, reactive retry, SSRF validation, and sendTextMessage delegation

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate WeComApiClient into WSClient and update public API** - `fb617a8` (feat)
2. **Task 2: Write unit tests for token management and reactive retry** - `281c4d3` (test)

## Files Created/Modified
- `src/types/config.ts` - Added `corpId?: string`, `agentId?: string`, `tokenFilePath?: string` to `WSClientOptions`
- `src/client.ts` - Added `path` import, token file path resolution, corpId fallback, `apiClient.stop()` in `disconnect()`
- `src/index.ts` - Added `export type { TokenCache, GetTokenResponse, WeComApiError } from './types/wecom-api'`
- `src/api.test.ts` - 15 unit tests for TokenManager and WeComApiClient with mocked axios

## Decisions Made
- `corpId` defaults to `botId` when not provided, maintaining backward compatibility for existing SDK consumers
- `tokenFilePath` defaults to `.bot-token.json` in cwd, consistent with existing persistence file naming conventions
- No changes to `BotConfig` in `src/config/index.ts` — plan explicitly kept those interfaces separate

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree git index was pre-populated with modified file hashes matching the working tree, causing `git diff` to show no changes initially. Resolved by explicitly comparing blob hashes and restoring files from the base commit before applying edits.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ssrf_mitigation | src/api.ts | Endpoint validation (`startsWith('/')` and `!includes('..')`) prevents SSRF; tests verify rejection of absolute URLs and path traversal |

## Known Stubs

None - all functionality is wired to real data sources.

## Self-Check: PASSED

- [x] `src/types/config.ts` exists and contains `corpId?: string`, `agentId?: string`, `tokenFilePath?: string`
- [x] `src/client.ts` imports `path`, computes `tokenFilePath`, passes object to `WeComApiClient`, calls `apiClient.stop()` in `disconnect()`
- [x] `src/index.ts` exports `TokenCache`, `GetTokenResponse`, `WeComApiError`
- [x] `src/api.test.ts` exists with 15 passing tests
- [x] Build passes (`npm run build` exits 0)
- [x] Tests pass (`npm test -- src/api.test.ts --run` exits 0)
- [x] No test token files remain after test run
- [x] Commits `fb617a8` and `281c4d3` exist in git log

## Next Phase Readiness
- WeComApiClient is fully integrated into WSClient and publicly exported
- Token management lifecycle (fetch, cache, persist, refresh, stop) is tested and verified
- Ready for Phase 8 (Docker Compose Deployment) and Phase 9 (Document Reading Integration)

---
*Phase: 07-wecom-api-client-foundation*
*Completed: 2026-04-21*
