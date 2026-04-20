# Phase 7: WeCom API Client Foundation - Research

**Researched:** 2026-04-20
**Domain:** WeCom Open Platform HTTP API / TypeScript SDK token management
**Confidence:** MEDIUM

## Summary

This phase enhances the existing `WeComApiClient` (`src/api.ts`) from a simple HTTP wrapper into a production-grade API client with automatic `access_token` lifecycle management. The client must obtain tokens via WeCom's `gettoken` endpoint, cache them in-memory and on disk, proactively refresh before expiry, and reactively recover from token errors by transparently retrying failed requests.

Key challenges are: (1) preventing concurrent token fetches under load via proper locking/queuing, (2) atomic file writes for token persistence (already established in `JsonFileBackend`), (3) distinguishing retryable token errors from permanent credential failures, and (4) designing a generic `request<T>()` method that injects `access_token` transparently while remaining testable with mocked HTTP.

The project already uses axios ^1.6.7, vitest ^4.1.2, and async I/O patterns from Phase 5. No new dependencies are needed.

**Primary recommendation:** Build a `TokenManager` class internal to `WeComApiClient` that handles fetch/cache/refresh concerns, expose a generic `request<T>(method, endpoint, params?, data?)` that delegates to axios after attaching the token, and use a `Promise` reference as an in-memory lock to deduplicate concurrent token fetches.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Cache `access_token` both **in-memory** and in a small **JSON file** (e.g., `.wecom-token.json` alongside the persistence file). Rationale: survives process restarts while keeping the hot path fast.
- **D-02:** Token file stores `{ access_token, expires_at }` where `expires_at` is an absolute timestamp (ms since epoch). File is written atomically (write to temp, rename) to avoid corruption.
- **D-03:** If token file read fails (corrupt, missing, permission error), silently fall back to fetching a new token — do not crash.
- **D-04:** **Proactive refresh** is the primary path: refresh the token 5 minutes before `expires_at`. A `setTimeout` or periodic check triggers the refresh in the background.
- **D-05:** **Reactive refresh** is the safety net: if any API call returns `40014` (access_token expired) or `40001` (access_token invalid), immediately fetch a new token and retry the original request **once**.
- **D-06:** Only `40014` and `40001` trigger reactive token refresh. Other error codes are passed through to callers.
- **D-07:** During proactive refresh, the old token remains usable until the new one is obtained. If refresh fails, the next API call will trigger reactive recovery.
- **D-08:** Implement a **generic `request<T>(method, endpoint, params?)`** method as the internal HTTP core. It handles attaching `access_token`, token refresh, and retry logic transparently.
- **D-09:** For Phase 7, expose the existing typed methods (`getAccessToken`, `sendTextMessage`, `downloadFileRaw`) plus the new generic `request()` on `WeComApiClient`. Phases 9-10 will add typed convenience methods.
- **D-10:** The generic `request()` method is **public** so advanced SDK consumers can call any WeCom Open Platform endpoint not yet covered by typed methods.
- **D-11:** Token-related retry (`40014`/`40001` -> refresh -> retry once) is **built into `WeComApiClient`** transparently. Callers do not need to handle token expiry.
- **D-12:** Non-token retry logic (network timeouts, 5xx) is left to callers or future transport layers. Phase 7 scope is token-specific retry only.

### Claude's Discretion
- Token file path derivation (e.g., next to persistence path vs. fixed name in cwd)
- Exact proactive refresh buffer (5 minutes is a guideline — may adjust based on WeCom behavior)
- Whether to use `fs/promises` async I/O or sync I/O for token file (project prefers async for I/O since Phase 5)
- `request()` method signature details (axios vs. native fetch wrapper, response type generics)
- Test mocking strategy for token expiry scenarios

### Deferred Ideas (OUT OF SCOPE)
- Typed convenience methods for document and schedule APIs — belong in Phases 9 and 10
- Non-token HTTP retry (network timeouts, 5xx) — out of scope for Phase 7
- Token caching in Redis or external store — overkill for single-process SDK

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WECOM-01 | SDK obtains and caches `access_token` using `corpId` + `secret` from BotConfig | TokenManager with in-memory cache + JSON file; `gettoken` endpoint returns `{access_token, expires_in: 7200}` |
| WECOM-02 | `access_token` is automatically refreshed before expiry without manual intervention | Proactive refresh via `setTimeout` 5 min before expiry; old token remains usable during refresh |
| WECOM-03 | API client handles common error codes (40014 token expired, 40001 token invalid) with retry | Reactive refresh on 40014/40001; retry original request once after obtaining new token |
| WECOM-04 | API client is exposed in SDK public exports for advanced consumers | `request<T>()` is public on `WeComApiClient`; already exported from `src/index.ts` |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token acquisition | API / Backend | — | `gettoken` is a WeCom server-to-server HTTP call |
| Token caching (in-memory) | API / Backend | — | Hot-path cache lives in `WeComApiClient` instance |
| Token caching (disk) | API / Backend | — | JSON file for Docker restart survival |
| Token refresh scheduling | API / Backend | — | `setTimeout` inside `WeComApiClient` |
| Auth injection | API / Backend | — | `request()` attaches `access_token` query param |
| Error code handling | API / Backend | — | 40014/40001 detection and retry logic in client |
| Public API surface | SDK Library | — | Exposed via `src/index.ts` barrel export |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | ^1.6.7 (installed) | HTTP client for WeCom API calls | Already used in `WeComApiClient`; supports interceptors, timeouts, response types |
| Node.js fs/promises | built-in | Async file I/O for token persistence | Project convention since Phase 5; `JsonFileBackend` already uses this pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.2 (installed) | Unit testing with mocking | Already used; `vi.mock()` for axios, `vi.useFakeTimers()` for expiry tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axios | native `fetch` | Node 22 has stable fetch, but axios interceptors and timeout handling are more ergonomic; switching breaks existing `WeComApiClient` |
| JSON file cache | better-sqlite3 | Overkill for a single key-value pair; JSON is simpler and matches existing persistence patterns |
| `setTimeout` refresh | `setInterval` polling | `setTimeout` per-expiry is more precise and avoids unnecessary wakeups; reschedule after each successful fetch |

**Installation:** No new packages required.

**Version verification:**
- axios: 1.15.1 current (project has ^1.6.7) [VERIFIED: npm registry]
- vitest: 4.1.4 current (project has ^4.1.2) [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
+----------------------------+     +----------------------------+
|  SDK Consumer / Bot        |     |  WeCom Open Platform       |
|                            |     |                            |
|  wsClient.api.request()    |     |  GET /cgi-bin/gettoken     |
|  wsClient.api.sendTextMessage() | |  POST /cgi-bin/message/send|
|       |                    |     |  GET /cgi-bin/...          |
|       v                    |     |                            |
|  +---------------------+   |     |                            |
|  | WeComApiClient      |   |     |                            |
|  |                     |   |     |                            |
|  |  +---------------+  |   |     |                            |
|  |  | TokenManager  |  |   |     |                            |
|  |  | - inMemToken  |  |   |     |                            |
|  |  | - tokenFile   |  |   |     |                            |
|  |  | - refreshTimer|  |   |     |                            |
|  |  | - fetchLock   |  |   |     |                            |
|  |  +---------------+  |   |     |                            |
|  |         |           |   |     |                            |
|  |  +---------------+  |   |     |                            |
|  |  | request<T>()  |  |   |     |                            |
|  |  | - attach token|  |   |     |                            |
|  |  | - 40014/40001?|--+---+---->|                            |
|  |  |   -> refresh  |  |   |     |                            |
|  |  |   -> retry x1 |  |   |     |                            |
|  |  +---------------+  |   |     |                            |
|  +---------------------+   |     |                            |
|       |                    |     |                            |
|       v                    |     |                            |
|  +---------------------+   |     |                            |
|  | axios instance      |   |     |                            |
|  +---------------------+   |     |                            |
+----------------------------+     +----------------------------+
```

### Recommended Project Structure

```
src/
├── api.ts                    # WeComApiClient (enhanced)
├── api.test.ts               # Unit tests for token management
├── token-manager.ts          # NEW: TokenManager class (extracted from api.ts)
├── types/
│   ├── api.ts                # Existing WsFrame, WsCmd, etc.
│   └── wecom-api.ts          # NEW: WeCom API response types (GetTokenResponse, etc.)
```

**Decision:** Whether to extract `TokenManager` to its own file is at Claude's discretion. Given the existing codebase keeps files moderately sized (`api.ts` is ~90 lines), adding token logic (~150 lines) may fit within `api.ts`. However, separating concerns improves testability. Recommendation: start in `api.ts` and extract if it grows beyond ~200 lines.

### Pattern 1: Token Fetch Deduplication (In-Memory Lock)
**What:** Use a `Promise` reference as a lock. When a token fetch is in flight, store the promise. Subsequent callers await the same promise instead of initiating duplicate fetches.
**When to use:** Any time multiple concurrent API calls may trigger token refresh simultaneously.
**Example:**
```typescript
// Source: [ASSUMED] — standard SDK pattern
class TokenManager {
  private fetchPromise: Promise<string> | null = null;

  async getToken(): Promise<string> {
    if (this.inMemToken && !this.isExpired()) {
      return this.inMemToken.access_token;
    }
    // Deduplicate concurrent fetches
    if (!this.fetchPromise) {
      this.fetchPromise = this.doFetch().finally(() => {
        this.fetchPromise = null;
      });
    }
    return this.fetchPromise;
  }
}
```

### Pattern 2: Proactive Refresh with `setTimeout`
**What:** After obtaining a token, schedule a background refresh for `expires_at - proactiveBuffer`.
**When to use:** When you want to avoid any latency from reactive refresh during normal operation.
**Example:**
```typescript
// Source: [ASSUMED] — standard SDK pattern
private scheduleRefresh(expiresAt: number): void {
  if (this.refreshTimer) clearTimeout(this.refreshTimer);
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const delay = Math.max(0, expiresAt - Date.now() - bufferMs);
  this.refreshTimer = setTimeout(() => this.refreshToken(), delay);
}
```

### Pattern 3: Atomic File Write (Cross-Platform)
**What:** Write to a temp file, then rename. On Windows, `fs.rename` may not be atomic across volumes, but for same-directory writes it is reliable. The existing `JsonFileBackend` already handles the Windows fallback.
**When to use:** Any JSON state file that must not be corrupted by a crash mid-write.
**Example:**
```typescript
// Source: src/persistence/json-file-backend.ts (existing project code)
async save(records: Record<string, ConversationRecord>): Promise<void> {
  const data = JSON.stringify(records);
  if (process.platform !== 'win32') {
    const tmpPath = `${this.path}.tmp`;
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, this.path);
  } else {
    await fs.writeFile(this.path, data, 'utf-8');
  }
}
```

### Pattern 4: Generic Request with Automatic Auth Injection
**What:** A `request<T>()` method that accepts HTTP method, endpoint path, query params, and optional body. It automatically attaches `access_token` to query params, makes the HTTP call, and handles token errors.
**When to use:** As the internal core for all WeCom API calls, and exposed publicly for advanced consumers.
**Example:**
```typescript
// Source: [ASSUMED] — based on existing api.ts patterns
async request<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  data?: unknown,
): Promise<T> {
  const token = await this.tokenManager.getToken();
  const url = `https://qyapi.weixin.qq.com/cgi-bin${endpoint}`;
  const response = await this.httpClient.request({
    method,
    url,
    params: { ...params, access_token: token },
    data,
  });
  // Handle WeCom error envelope
  if (response.data.errcode !== 0) {
    if (response.data.errcode === 40014 || response.data.errcode === 40001) {
      // Reactive refresh and retry once
      await this.tokenManager.forceRefresh();
      return this.request(method, endpoint, params, data); // retry once
    }
    throw new Error(`WeCom API error: ${response.data.errmsg} (${response.data.errcode})`);
  }
  return response.data as T;
}
```

### Anti-Patterns to Avoid
- **Storing `expires_in` instead of `expires_at`:** Relative expiry drifts with system time / suspend-resume. Always compute and store absolute `expires_at`.
- **Synchronous file I/O for token persistence:** Blocks the event loop. The project already uses async I/O since Phase 5.
- **Retrying more than once on token errors:** If a fresh token also fails with 40014/40001, the credentials are likely invalid. Retry once only.
- **Using `access_token` in request body:** WeCom requires it as a query parameter, not in the JSON body.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client with interceptors | Custom wrapper around `http` module | axios (already in project) | Retry logic, timeout handling, response parsing, query param serialization |
| JSON serialization | Custom stringify | `JSON.stringify` + type assertions | WeCom API returns predictable JSON envelopes |
| Timer management | Manual `setInterval` polling | `setTimeout` per expiry | More precise, avoids unnecessary wakeups |
| File locking for token cache | OS-level file locks | Atomic write (temp + rename) + in-memory dedup lock | Simpler, cross-platform, sufficient for single-process SDK |

**Key insight:** The token management problem is fundamentally about concurrency control (deduplicating fetches) and state persistence (surviving restarts), not about HTTP complexity. The HTTP layer is already solved by axios.

---

## Runtime State Inventory

This phase is a greenfield enhancement (adding capabilities to existing code), not a rename/refactor/migration. No runtime state inventory needed.

---

## Common Pitfalls

### Pitfall 1: Concurrent Token Fetch Storm
**What goes wrong:** Under load, 10 API calls hit simultaneously when the token is expired. Without deduplication, 10 separate `gettoken` requests are fired, potentially triggering WeCom rate limits.
**Why it happens:** Each `request()` call independently checks token expiry and initiates a fetch.
**How to avoid:** Use a single `Promise` reference as an in-memory lock. All concurrent callers await the same fetch promise.
**Warning signs:** Unit tests with `Promise.all([client.request(), client.request()])` show multiple `gettoken` calls.

### Pitfall 2: Token File Corruption on Crash
**What goes wrong:** Process crashes while writing the token file, leaving a partially-written JSON file. On next startup, `JSON.parse` throws and the client crashes instead of falling back.
**Why it happens:** Direct write to the target file without atomic replacement.
**How to avoid:** Write to `.token.json.tmp`, then `fs.rename()` to `.token.json`. On read failure, catch and fall back to fetching a new token (per D-03).
**Warning signs:** `SyntaxError: Unexpected end of JSON input` on startup after a crash.

### Pitfall 3: Time Drift Causing Premature Expiry
**What goes wrong:** Server clock is slightly ahead of local clock. Token appears valid locally but is rejected by WeCom as expired.
**Why it happens:** `expires_at` is computed from local `Date.now() + expires_in * 1000`, but server time may differ.
**How to avoid:** Proactive refresh with a buffer (5 minutes per D-04) absorbs typical clock skew. Do not rely on exact `expires_in`.
**Warning signs:** Intermittent 40014 errors even with "valid" tokens.

### Pitfall 4: Infinite Retry Loop on Invalid Credentials
**What goes wrong:** If `corpId`/`secret` are permanently invalid, reactive refresh fetches a new token, the new token is also invalid, and the request retries indefinitely.
**Why it happens:** Retry logic does not distinguish temporary token expiry from permanent credential failure.
**How to avoid:** Only retry **once** after reactive refresh. If the retry also fails with 40014/40001, throw the error to the caller.
**Warning signs:** Unit test with invalid credentials runs forever or makes excessive HTTP calls.

### Pitfall 5: `setTimeout` Leak on Client Destruction
**What goes wrong:** `WeComApiClient` instances are recreated (e.g., in tests or hot-reload), but the old `setTimeout` timer keeps firing and tries to refresh using a stale instance.
**Why it happens:** No cleanup method for the refresh timer.
**How to avoid:** Store the timer ID and provide a `stop()` or `close()` method on `WeComApiClient` that clears it. `WSClient` can call this in `disconnect()`.
**Warning signs:** Test suite shows unexpected `gettoken` calls after tests complete.

---

## Code Examples

### Verified patterns from official sources:

### Token File Structure
```typescript
// Source: [CITED: 07-CONTEXT.md D-02]
interface TokenCache {
  access_token: string;
  expires_at: number; // absolute timestamp in ms
}
```

### Axios Mocking for Token Tests (vitest)
```typescript
// Source: [VERIFIED: vitest docs + existing project test patterns]
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

beforeEach(() => {
  mockedAxios.create.mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  } as any);
});

it('refreshes token on 40014 and retries once', async () => {
  const mockGet = vi.fn()
    .mockResolvedValueOnce({ data: { errcode: 40014, errmsg: 'token expired' } })
    .mockResolvedValueOnce({ data: { errcode: 0, result: 'ok' } });

  mockedAxios.create.mockReturnValue({ request: mockGet } as any);

  // ... test implementation
});
```

### Generic Request Method Signature
```typescript
// Source: [ASSUMED] — based on existing api.ts and axios types
async request<T>(
  method: 'GET' | 'POST',
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>,
  data?: unknown,
): Promise<T>;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual token passing (`sendTextMessage(token, ...)`) | Automatic token injection via `request<T>()` | Phase 7 (this phase) | Callers no longer manage token lifecycle |
| No token persistence | In-memory + JSON file cache | Phase 7 (this phase) | Survives process restarts without extra fetches |
| No proactive refresh | `setTimeout`-based proactive refresh | Phase 7 (this phase) | Eliminates latency from reactive refresh in normal operation |

**Deprecated/outdated:**
- None for this phase.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WeCom `gettoken` returns `expires_in: 7200` seconds (2 hours) | Standard Stack | If expiry is different (e.g., 3600), proactive refresh timing may be off. Mitigation: buffer is configurable. |
| A2 | WeCom error codes 40014 and 40001 are the only token-related errors requiring reactive refresh | Common Pitfalls | If 42001 (access_token expired) or other codes also indicate token expiry, they will not trigger reactive refresh. User confirmed only 40014/40001 in D-06. |
| A3 | `access_token` must be attached as a query parameter (`?access_token=xxx`), not in headers or body | Architecture Patterns | If WeCom supports header-based auth, query param still works. Low risk. |
| A4 | `fs.rename()` on Windows in the same directory is sufficiently atomic for token file writes | Architecture Patterns | If not, token file corruption possible on crash. Existing `JsonFileBackend` uses same pattern and has been acceptable. |
| A5 | A single `Promise` reference is sufficient for deduplicating concurrent token fetches in a single-process SDK | Common Pitfalls | If SDK is used in a cluster/worker setup, multiple processes may fetch concurrently. Out of scope for single-process design. |

---

## Open Questions (RESOLVED)

1. **WeCom `gettoken` rate limits** — RESOLVED
   - Decision: Fetch deduplication via single Promise lock (Pattern 1) implemented in `TokenManager`. Documented in code comments.

2. **Token file path in Docker** — RESOLVED
   - Decision: Default to `.bot-token.json` in cwd, overridable via `WSClientOptions.tokenFilePath`. Docker volume mount covers cwd.

3. **Test isolation for token file** — RESOLVED
   - Decision: Use separate temp path per test with `afterEach` cleanup, matching existing persistence test pattern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.14.0 | — |
| axios | HTTP client | Yes | 1.6.7 installed | — |
| vitest | Testing | Yes | 4.1.2 installed | — |
| fs/promises | Token file I/O | Yes | built-in | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

> `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is omitted per instructions.

---

## Security Domain

> `security_enforcement` is not explicitly set to `false` in config. Security domain included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `access_token` is a bearer token; must be kept out of logs and error messages |
| V3 Session Management | No | No user sessions; token is app-level |
| V4 Access Control | No | WeCom platform handles access control |
| V5 Input Validation | Yes | Validate `errcode` is numeric; sanitize file paths for token cache |
| V6 Cryptography | No | Token is opaque string from WeCom; no client-side crypto needed |

### Known Threat Patterns for WeCom API Client

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leakage in logs | Information Disclosure | Never log `access_token` value; log only expiry status or masked prefix |
| Token file world-readable | Information Disclosure | Use `fs.writeFile` with mode `0o600` (owner read/write only) where supported |
| Replay of expired token | Tampering | Proactive refresh + reactive retry handles this transparently |
| SSRF via endpoint parameter | Spoofing | `request()` should validate `endpoint` starts with `/` and does not contain `..` or hostnames |

---

## Sources

### Primary (HIGH confidence)
- `src/api.ts` — Existing `WeComApiClient` implementation, axios usage patterns
- `src/persistence/json-file-backend.ts` — Atomic file write pattern (temp + rename)
- `src/config/index.ts` — `BotConfig` interface with `corpId`, `agentId`, `persistencePath`
- `src/client.ts` — `WSClient` construction of `WeComApiClient`, `get api()` accessor
- `src/index.ts` — Public exports already include `WeComApiClient`
- `package.json` — Dependency versions (axios ^1.6.7, vitest ^4.1.2)

### Secondary (MEDIUM confidence)
- WebFetch of `developer.work.weixin.qq.com/document/path/91039` — Confirmed `gettoken` endpoint URL, `expires_in: 7200`, response format `{errcode, errmsg, access_token, expires_in}`
- WebFetch of `developer.work.weixin.qq.com/document/path/90313` — Page title confirms global error codes exist, but CSS-only content prevented full extraction

### Tertiary (LOW confidence)
- Training knowledge of WeCom error codes 40001, 40014, 42001 — Marked as [ASSUMED] in research; user has locked 40014/40001 as the reactive refresh triggers in D-06

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, versions verified
- Architecture: MEDIUM — patterns are standard SDK practices, but WeCom-specific edge cases (rate limits, exact error codes) not fully verifiable via available docs
- Pitfalls: MEDIUM — based on common SDK patterns and project-specific context (async I/O, Windows platform)

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (WeCom API is stable; only re-verify if error code behavior changes)
