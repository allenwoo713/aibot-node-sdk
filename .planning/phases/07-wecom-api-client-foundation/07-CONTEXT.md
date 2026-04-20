# Phase 7: WeCom API Client Foundation - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

SDK consumers and the bot can reliably call WeCom Open Platform APIs with automatic authentication and error recovery. This phase enhances the existing `WeComApiClient` (`src/api.ts`) to:

1. Automatically obtain and cache `access_token` using `corpId` + `secret` from `BotConfig`
2. Transparently refresh `access_token` before expiry without failing the original request
3. Handle common token error codes (`40014` token expired, `40001` token invalid) with automatic retry
4. Expose the API client in SDK public exports for advanced consumers

The client currently only supports `getAccessToken()`, `sendTextMessage()`, and `downloadFileRaw()`. This phase adds the token management layer and a generic `request()` core that future phases (9–10) will build upon.

</domain>

<decisions>
## Implementation Decisions

### Token Caching Strategy
- **D-01:** Cache `access_token` both **in-memory** and in a small **JSON file** (e.g., `.wecom-token.json` alongside the persistence file). Rationale: survives process restarts (Docker, SIGTERM) while keeping the hot path fast. Token is re-fetched from file on client instantiation if present and not expired.
- **D-02:** Token file stores `{ access_token, expires_at }` where `expires_at` is an absolute timestamp (ms since epoch). File is written atomically (write to temp, rename) to avoid corruption.
- **D-03:** If token file read fails (corrupt, missing, permission error), silently fall back to fetching a new token — do not crash.

### Token Refresh Approach
- **D-04:** **Proactive refresh** is the primary path: refresh the token 5 minutes before `expires_at`. A `setTimeout` or periodic check triggers the refresh in the background.
- **D-05:** **Reactive refresh** is the safety net: if any API call returns `40014` (access_token expired) or `40001` (access_token invalid), immediately fetch a new token and retry the original request **once**.
- **D-06:** Only `40014` and `40001` trigger reactive token refresh. Other error codes (rate limit, param error, etc.) are passed through to callers.
- **D-07:** During proactive refresh, the old token remains usable until the new one is obtained. If refresh fails, the next API call will trigger reactive recovery.

### API Client Surface Area
- **D-08:** Implement a **generic `request<T>(method, endpoint, params?)`** method as the internal HTTP core. It handles attaching `access_token`, token refresh, and retry logic transparently.
- **D-09:** For Phase 7, expose the existing typed methods (`getAccessToken`, `sendTextMessage`, `downloadFileRaw`) plus the new generic `request()` on `WeComApiClient`. Phases 9–10 will add typed convenience methods (e.g., `getDocument()`, `createSchedule()`) that delegate to `request()`.
- **D-10:** The generic `request()` method is **public** so advanced SDK consumers can call any WeCom Open Platform endpoint not yet covered by typed methods.

### Error Retry Responsibility
- **D-11:** Token-related retry (`40014`/`40001` → refresh → retry once) is **built into `WeComApiClient`** transparently. Callers do not need to handle token expiry.
- **D-12:** Non-token retry logic (network timeouts, 5xx) is left to callers or future transport layers. Phase 7 scope is token-specific retry only.

### Claude's Discretion
- Token file path derivation (e.g., next to persistence path vs. fixed name in cwd)
- Exact proactive refresh buffer (5 minutes is a guideline — may adjust based on WeCom behavior)
- Whether to use `fs/promises` async I/O or sync I/O for token file (project prefers async for I/O since Phase 5)
- `request()` method signature details (axios vs. native fetch wrapper, response type generics)
- Test mocking strategy for token expiry scenarios

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, and requirement mapping (WECOM-01 to WECOM-04)
- `.planning/REQUIREMENTS.md` — WECOM-01 through WECOM-04 acceptance criteria
- `.planning/PROJECT.md` — v1.2 milestone context and target features

### Existing Code
- `src/api.ts` — Current `WeComApiClient` with `getAccessToken()`, `sendTextMessage()`, `downloadFileRaw()`
- `src/client.ts` — `WSClient` that instantiates and exposes `WeComApiClient` via `get api()`
- `src/index.ts` — Public SDK exports (already exports `WeComApiClient`)
- `src/config/index.ts` — `BotConfig` interface with `corpId` and `agentId` fields
- `src/bot/index.ts` — `BotOrchestrator` (will consume the enhanced API client in Phases 9–10)
- `src/types/api.ts` — Type definitions for WebSocket frames and message bodies

### Prior Phase Decisions
- `.planning/phases/05-persistent-conversation-storage/05-CONTEXT.md` — Async I/O patterns, better-sqlite3, file I/O conventions
- `.planning/phases/06-integration-deployment/06-CONTEXT.md` — Public API export patterns, Dockerfile context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WeComApiClient` already exists with axios-based HTTP client, logger injection, and timeout config
- `BotConfig` already carries `corpId` and `agentId` (corpId defaults to botId)
- `WSClient` already exposes the API client via `get api()` — consumers can access it today

### Established Patterns
- Environment-based configuration: all tunables loaded from `process.env` via `getEnv()` / `getEnvInt()`
- Best-effort error suppression: catch errors, log warnings, fall back gracefully (seen in `ConversationStore.load()`)
- Async I/O preferred: Phase 5 migrated sync file I/O to async — token file should follow this pattern
- Chinese fallback messages: match existing UX for bot-facing errors

### Integration Points
- `WeComApiClient` is constructed by `WSClient` in its constructor — will need `corpId`/`secret` passed in
- `BotOrchestrator` currently does not use `WeComApiClient` directly — Phases 9–10 will inject it
- Token file should live near persistence path for Docker volume consistency

</code_context>

<specifics>
## Specific Ideas

- Token file path: derive from `persistencePath` by changing extension to `.token.json` (e.g., `.bot-state.json` → `.bot-state.token.json`) so it stays in the same Docker volume
- Proactive refresh buffer: 5 minutes (300 seconds) before expiry
- Atomic file writes for token persistence: write to `.token.json.tmp`, then `fs.rename()` to `.token.json`
- The existing `sendTextMessage()` on `WeComApiClient` should be migrated to use the new generic `request()` internally

</specifics>

<deferred>
## Deferred Ideas

- Typed convenience methods for document and schedule APIs — belong in Phases 9 and 10
- Non-token HTTP retry (network timeouts, 5xx) — out of scope for Phase 7
- Token caching in Redis or external store — overkill for single-process SDK

</deferred>

---

*Phase: 07-wecom-api-client-foundation*
*Context gathered: 2026-04-21*
