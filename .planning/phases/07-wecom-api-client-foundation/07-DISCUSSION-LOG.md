# Phase 7: WeCom API Client Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 7-WeCom API Client Foundation
**Areas discussed:** Token caching strategy, Token refresh approach, API client surface area

---

## Token Caching Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory only | Simple private field in WeComApiClient. Lost on restart, but tokens are free to re-fetch. | |
| In-memory + file backup | Also persist token + expiry to a small JSON file. Survives restarts, avoids unnecessary API calls. | ✓ |
| You decide | Leave the caching strategy to Claude's discretion. | |

**User's choice:** In-memory + file backup
**Notes:** Token file stores `{ access_token, expires_at }` alongside persistence path. Atomic writes (temp + rename). Corrupt/missing file silently falls back to fetching new token.

---

## Token Refresh Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Proactive refresh | Refresh 5 minutes before expiry. Callers never see token errors. Doesn't handle clock skew. | |
| Reactive refresh | Only refresh on 40014/40001, then retry original call once. Simpler, but one request may fail first. | |
| Both (recommended) | Proactive as primary, reactive as safety net. Most robust for production. | ✓ |

**User's choice:** Both (recommended)
**Notes:** Proactive refresh via setTimeout/periodic check 5 minutes before expiry. Reactive as safety net for clock skew or premature invalidation. Only 40014 and 40001 trigger reactive refresh. Old token remains usable during proactive refresh.

---

## API Client Surface Area

| Option | Description | Selected |
|--------|-------------|----------|
| Specific typed methods | Add typed methods per endpoint. Better DX, more boilerplate. | |
| Generic request() method | One flexible method. Less SDK code, callers handle types. | |
| Hybrid (recommended) | Generic core now, typed convenience methods added per phase. Best of both. | ✓ |

**User's choice:** Hybrid (recommended)
**Notes:** Generic `request<T>()` as internal core for Phase 7. Existing typed methods (`getAccessToken`, `sendTextMessage`, `downloadFileRaw`) preserved. Phases 9–10 add convenience methods (`getDocument()`, `createSchedule()`, etc.) that delegate to `request()`. Generic method is public for advanced consumers.

---

## Claude's Discretion

- Error retry responsibility (non-token retries) — left to callers/future phases
- Token file path derivation — derive from `persistencePath`
- Exact proactive refresh buffer — 5 minutes guideline
- Async vs sync I/O for token file — follow Phase 5 async pattern
- `request()` signature details — axios-based, generic response type

## Deferred Ideas

None discussed — all ideas stayed within phase scope.
