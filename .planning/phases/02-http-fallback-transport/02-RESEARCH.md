# Phase 2: HTTP Fallback Transport - Research

**Researched:** 2026-04-15
**Domain:** WeCom HTTP APIs, Node.js TypeScript SDK, Transport abstraction
**Confidence:** HIGH

## Summary

Phase 2 introduces a unified `Transport` interface to decouple `BotOrchestrator` from WebSocket-specific APIs, and implements WeCom HTTP API fallback for both inbound (callback) and outbound (message sending) messaging. The existing codebase already contains the right primitives: `WeComApiClient` (axios-based HTTP client), `WecomCrypto` (AES-256-CBC + SHA1), `MessageHandler` (frame normalization), and the `AiBackend` adapter pattern.

The primary research findings are:
1. **WeCom HTTP message API** uses `POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN` with a JSON body containing `touser`/`toparty`/`totag`, `msgtype`, `agentid`, and message content. `access_token` expires every 7200 seconds and must be refreshed on error code `42001` [VERIFIED: official WeCom docs].
2. **WeCom callback mode** delivers push messages/events via HTTP POST to a developer-configured URL. Verification requires SHA1 signature over `token`, `timestamp`, `nonce`, and `Encrypt` payload, plus AES-256-CBC decryption of the `Encrypt` field. The SDK already implements exactly this crypto in `src/wecom-crypto/index.ts` [VERIFIED: codebase audit].
3. **Transport abstraction** should be minimal and event-emitter-based, matching the existing `AiBackend` pattern. `BotOrchestrator` only needs `on('message.text', ...)`, `sendText(replyTo, text)`, and lifecycle `connect()`/`stop()` methods.
4. **No new runtime dependencies** are required. `axios` and `eventemitter3` are already in `package.json`. Node.js 22, pnpm, and vitest are all available in the environment.

**Primary recommendation:** Build `HttpTransport` inside `src/transport/`, extend `WeComApiClient` with token fetching/caching, reuse `WecomCrypto` for callback verification/decryption, and refactor `BotOrchestrator` to accept a `Transport` interface injected at construction time.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WebSocket transport | SDK client (`WSClient`) | — | Existing `ws`-based layer owns WS lifecycle |
| HTTP message sending | SDK client (`WeComApiClient` extension) | — | HTTP is a transport detail, belongs in SDK |
| HTTP callback handling | SDK client (framework-agnostic handler) | API/backend server | SDK provides the handler; host app mounts it |
| Transport abstraction | SDK client (`Transport` interface) | — | Unified contract lives in SDK so consumers stay decoupled |
| access_token caching | SDK client (`HttpTransport` / `WeComApiClient`) | — | In-memory cache with refresh lock is a client concern |
| Message normalization | SDK client (`MessageHandler`) | — | Reusable for both WS and HTTP inbound paths |
| Bot orchestration | `BotOrchestrator` | — | Must remain transport-agnostic per COMPAT-03 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `axios` | ^1.6.7 (latest 1.15.0) | HTTP client for WeCom APIs | Already used by `WeComApiClient`; handles JSON, timeouts, interceptors [VERIFIED: npm registry] |
| `eventemitter3` | ^5.0.1 (latest 5.0.4) | Typed event emitter for `Transport` | Already used by `WSClient`; same pattern keeps `BotOrchestrator` code unchanged [VERIFIED: npm registry] |
| `ws` | ^8.16.0 (latest 8.20.0) | WebSocket transport | Existing primary transport; no change needed [VERIFIED: npm registry] |
| `vitest` | ^4.1.2 (latest 4.1.4) | Unit/integration test runner | Existing test framework [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (Node.js built-in) | — | SHA1 signatures, AES-256-CBC decrypt | Already used by `WecomCrypto`; no additional dependency needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `axios` | `node-fetch` / native `fetch` | `axios` is already in the project and provides better timeout/interceptor ergonomics for token refresh |
| `eventemitter3` | Node.js `EventEmitter` | `eventemitter3` is already used and provides typed generics that match existing code |

**Installation:** No new packages required.

**Version verification:**
- `axios`: project uses ^1.6.7, npm latest is 1.15.0 [VERIFIED: npm registry]
- `eventemitter3`: project uses ^5.0.1, npm latest is 5.0.4 [VERIFIED: npm registry]
- `ws`: project uses ^8.16.0, npm latest is 8.20.0 [VERIFIED: npm registry]
- `vitest`: project uses ^4.1.2, npm latest is 4.1.4 [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```
                    +------------------+
                    |   WeCom Server   |
                    +--------+---------+
                             |
         +-------------------+-------------------+
         | WebSocket path    | HTTP path         |
         v                   v                   |
+--------+--------+  +-------+--------+          |
|  WsConnection   |  |  HttpTransport |          |
|    Manager      |  |  (axios-based) |          |
+--------+--------+  +-------+--------+          |
         |                   |                   |
         | emits frames      | normalizes to     |
         |                   | WsFrame           |
         v                   v                   |
+--------+--------+  +-------+--------+          |
| MessageHandler  |  | MessageHandler |          |
| (existing)      |  | (existing)     |          |
+--------+--------+  +-------+--------+          |
         |                   |                   |
         +---------+---------+                   |
                   |                             |
                   v                             |
          +--------+---------+                   |
          |  Transport       |                   |
          |  Interface       |                   |
          +--------+---------+                   |
                   |                             |
                   v                             |
          +--------+---------+                   |
          | BotOrchestrator  |                   |
          | (transport-      |                   |
          |  agnostic)       |                   |
          +--------+---------+                   |
                   |                             |
         +---------+---------+                   |
         |                   |                   |
         v                   v                   |
+--------+--------+  +-------+--------+          |
|  AI Backend     |  | Conversation   |          |
|  (Anthropic)    |  | Store          |          |
+-----------------+  +----------------+          |
```

### Recommended Project Structure
```
src/
├── transport/
│   ├── index.ts           # Transport interface + re-exports
│   ├── ws-transport.ts    # WSClient wrapper implementing Transport
│   ├── http-transport.ts  # HTTP transport + token cache
│   └── http-callback.ts   # Framework-agnostic callback handler
├── api.ts                 # Extended WeComApiClient (getToken, sendMessage)
├── wecom-crypto/          # Existing crypto (reused)
├── message-handler.ts     # Existing (reused)
├── bot/
│   ├── index.ts           # Refactored BotOrchestrator
│   └── entry.ts           # Transport selection / wiring
└── types/
    └── transport.ts       # Transport interface types
```

### Pattern 1: Minimal Transport Interface
**What:** A thin abstraction exposing only what `BotOrchestrator` needs, similar to `AiBackend`.
**When to use:** For all transport implementations (WS and HTTP).
**Example:**
```typescript
// Source: existing AiBackend pattern in src/ai/adapter.ts
export interface Transport extends EventEmitter<WSClientEventMap> {
  connect(): void;
  stop(): void;
  sendText(replyTo: WsFrameHeaders, text: string): Promise<void>;
  isConnected(): boolean;
}
```

### Pattern 2: Promise-Based Token Refresh Lock
**What:** Prevent thundering-herd token refresh when multiple concurrent HTTP requests hit a 42001 error.
**When to use:** Inside `HttpTransport` or `WeComApiClient` when fetching `access_token`.
**Example:**
```typescript
// Source: recommended by CONTEXT.md Claude's Discretion
class TokenCache {
  private token: string | null = null;
  private expiresAt = 0;
  private refreshPromise: Promise<string> | null = null;

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) {
      return this.token;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async fetchToken(): Promise<string> {
    // call gettoken API
  }
}
```

### Pattern 3: Callback Normalization to WsFrame
**What:** Convert WeCom HTTP callback payload into the same `WsFrame` shape used by WebSocket, then pass through `MessageHandler`.
**When to use:** In the HTTP callback handler after decryption.
**Example:**
```typescript
// Source: existing WsFrame type in src/types/api.ts
function normalizeCallbackToFrame(decryptedPayload: any): WsFrame {
  return {
    cmd: decryptedPayload.msgtype === 'event'
      ? WsCmd.EVENT_CALLBACK
      : WsCmd.CALLBACK,
    headers: { req_id: generateReqId('http_callback') },
    body: decryptedPayload,
  };
}
```

### Anti-Patterns to Avoid
- **Leaking WS-specific methods into Transport:** Do not expose `replyStream`, `uploadMedia`, or `replyTemplateCard` on `Transport`. `BotOrchestrator` currently only needs text replies. Additional methods can be added later without breaking the interface.
- **Framework-dependent callback handler:** Do not import Express, Fastify, or Koa inside the SDK. Provide a pure function that accepts `{ signature, timestamp, nonce, body }` and returns a response object.
- **Synchronous token fetch in hot path:** Always `await` the token cache; never block with synchronous HTTP calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA1 signature verification | Custom hash implementation | `WecomCrypto.verifySignature()` in `src/wecom-crypto/index.ts` | Already implemented, tested, and matches WeCom spec exactly |
| AES-256-CBC decryption | Custom cipher code | `WecomCrypto.decrypt()` in `src/wecom-crypto/index.ts` | Handles PKCS#7 padding, random prefix stripping, and receiveId validation |
| HTTP client | Native `http` module | `axios` (already in project) | Interceptors, timeout handling, JSON serialization |
| Event emitter | Node.js `EventEmitter` | `eventemitter3` (already in project) | Typed generics, better performance, matches existing code |
| Token refresh serialization | `setTimeout` polling | Promise-based refresh lock | Prevents duplicate requests and race conditions |

**Key insight:** The SDK already solved the hardest parts (crypto, framing, event dispatch). The HTTP transport layer is primarily plumbing and state management.

## Runtime State Inventory

This phase does not involve renaming, rebranding, or migrating stored data. However, the following runtime state categories were checked:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database or persistent datastore other than `.bot-state.json` conversation file | None |
| Live service config | None — the SDK does not manage external live services with UI-based config | None |
| OS-registered state | None — no OS-level task schedulers or systemd units reference transport config | None |
| Secrets/env vars | `BOT_ID`, `SECRET`, `ANTHROPIC_API_KEY` existing; may need `CORP_ID` and `AGENT_ID` for HTTP APIs | Add optional config fields, document in `.env.example` |
| Build artifacts | None — new transport code compiles through existing rollup config | Ensure new `src/transport/` files are included in TypeScript build |

**Nothing found in category:** Stored data, live service config, and OS-registered state explicitly verified as none.

## Common Pitfalls

### Pitfall 1: Token Refresh Thundering Herd
**What goes wrong:** Multiple concurrent HTTP send requests all receive 42001, each triggers a separate `gettoken` call, wasting quota and causing races.
**Why it happens:** No synchronization around the token refresh operation.
**How to avoid:** Use a single `Promise<string>` refresh lock. All concurrent requests wait on the same promise.
**Warning signs:** Unit tests show multiple `gettoken` network calls for a single 42001 event.

### Pitfall 2: Callback Signature Replay Attacks
**What goes wrong:** An attacker replays an old WeCom callback request with a valid signature. The SDK processes it twice.
**Why it happens:** Timestamp freshness is not validated, or deduplication is missing.
**How to avoid:** Reject callbacks where `|now - timestamp| > 5 minutes`. Maintain a short-lived `Set<string>` of seen `msgid` values (5-minute TTL) to deduplicate across WS/HTTP transition windows.
**Warning signs:** Same `msgid` appears in logs from both WebSocket and HTTP handlers.

### Pitfall 3: BotOrchestrator Breaking Changes
**What goes wrong:** Refactoring `BotOrchestrator` to use `Transport` accidentally changes public API or breaks existing consumers.
**Why it happens:** `BotOrchestrator` currently constructs `WSClient` internally. Changing constructor signature without preserving defaults is a breaking change.
**How to avoid:** Keep `BotOrchestrator` constructor accepting `BotConfig`, but allow an optional `transport` override. In `entry.ts`, wire the appropriate transport. Existing direct consumers of `BotOrchestrator` should still compile.
**Warning signs:** `src/bot/index.test.ts` fails to compile after refactor.

### Pitfall 4: HTTP Callback Body Parsing Assumptions
**What goes wrong:** The callback handler assumes JSON payload, but WeCom callbacks are XML-wrapped (Encrypt inside XML) in traditional callback mode.
**Why it happens:** WeCom aibot HTTP callbacks may use JSON or XML depending on configuration. The SDK must handle the envelope generically.
**How to avoid:** Accept the raw request body as a string or buffer, extract `Encrypt` (from JSON or XML), decrypt it, then parse the inner payload as JSON.
**Warning signs:** Tests pass with JSON but fail in production against XML envelopes.

## Code Examples

### Verified patterns from official sources:

### Access Token Fetch and Cache
```typescript
// Source: WeCom official docs (gettoken endpoint)
const GET_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken';

async function fetchAccessToken(corpid: string, corpsecret: string): Promise<{ access_token: string; expires_in: number }> {
  const { data } = await axios.get(GET_TOKEN_URL, {
    params: { corpid, corpsecret },
  });
  if (data.errcode !== 0) {
    throw new Error(`gettoken failed: ${data.errmsg} (${data.errcode})`);
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}
```

### HTTP Send Message Request
```typescript
// Source: WeCom official docs (message/send endpoint)
const SEND_MSG_URL = 'https://qyapi.weixin.qq.com/cgi-bin/message/send';

async function sendTextMessage(
  token: string,
  agentid: string,
  touser: string,
  content: string,
): Promise<void> {
  const { data } = await axios.post(SEND_MSG_URL, {
    touser,
    msgtype: 'text',
    agentid,
    text: { content },
    safe: 0,
  }, {
    params: { access_token: token },
  });
  if (data.errcode === 42001) {
    throw new TokenExpiredError();
  }
  if (data.errcode !== 0) {
    throw new Error(`send failed: ${data.errmsg} (${data.errcode})`);
  }
}
```

### Framework-Agnostic Callback Handler
```typescript
// Source: recommended pattern from CONTEXT.md
export interface CallbackPayload {
  signature: string;
  timestamp: string;
  nonce: string;
  body: string; // raw request body
}

export interface CallbackResponse {
  status: number;
  body: string;
}

export async function handleCallback(
  payload: CallbackPayload,
  crypto: WecomCrypto,
): Promise<CallbackResponse> {
  // 1. Extract Encrypt from XML or JSON envelope
  const encrypt = extractEncrypt(payload.body);

  // 2. Verify signature
  if (!crypto.verifySignature(payload.signature, payload.timestamp, payload.nonce, encrypt)) {
    return { status: 403, body: 'Forbidden' };
  }

  // 3. Decrypt
  const decrypted = crypto.decrypt(encrypt);
  const inner = JSON.parse(decrypted);

  // 4. Normalize to WsFrame and emit
  const frame = normalizeCallbackToFrame(inner);
  emitter.emit('message.text', frame);

  return { status: 200, body: 'success' };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `BotOrchestrator` hardcodes `WSClient` | `BotOrchestrator` depends on `Transport` interface | This phase | Enables HTTP fallback and future transports without bot logic changes |
| `WeComApiClient` only downloads files | `WeComApiClient` also fetches tokens and sends messages | This phase | Centralizes all WeCom HTTP API calls in one client |
| WebSocket-only inbound | WS + HTTP callback dual inbound | This phase | Prevents message loss during transport transitions |

**Deprecated/outdated:**
- None for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WeCom HTTP callback for aibot uses the same SHA1 + AES-256-CBC scheme as standard application callbacks | Architecture Patterns / Code Examples | Callback verification would fail; signature mismatch or decryption errors |
| A2 | `agentid` is required for `message/send` HTTP API and can be derived from bot configuration | Code Examples | HTTP message sending would fail with invalid agentid |
| A3 | WeCom callback payload envelope contains `Encrypt` field (either JSON or XML) that must be decrypted to obtain the inner JSON message/event | Code Examples | Callback handler would fail to parse inbound messages |
| A4 | A 5-minute timestamp freshness window and a 5-minute `msgid` deduplication TTL are sufficient for production use | Common Pitfalls | Replay attacks or duplicate message processing during transition |

## Open Questions

1. **Does the user have `CORP_ID` and `AGENT_ID` available in their environment?**
   - What we know: `BotConfig` currently has `botId` and `secret`. The HTTP `message/send` API requires `agentid`, and `gettoken` requires `corpid` + `corpsecret`.
   - What's unclear: Whether `botId` maps to `agentid` and whether `secret` maps to `corpsecret`, or if separate env vars are needed.
   - Recommendation: Add optional `corpId` and `agentId` to `BotConfig` with fallbacks to `botId`/`secret` to maximize compatibility.

2. **What is the exact envelope format of WeCom aibot HTTP callbacks?**
   - What we know: Standard WeCom callbacks wrap the payload in XML with `Encrypt`, `MsgSignature`, `TimeStamp`, `Nonce`. Some newer APIs use JSON.
   - What's unclear: Whether aibot callbacks use XML or JSON envelope.
   - Recommendation: Implement envelope extraction that handles both XML and JSON gracefully (look for `Encrypt` field regardless of wrapping format).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | yes | 22.14.0 | — |
| npm | Package management | yes | 11.5.2 | — |
| pnpm | Package management / lockfile | yes | 10.33.0 | npm |
| vitest | Testing | yes | ^4.1.2 | — |
| axios | HTTP client | yes | ^1.6.7 | — |
| eventemitter3 | Event emitter | yes | ^5.0.1 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

> Skip this section entirely if workflow.nyquist_validation is explicitly set to false in .planning/config.json. If the key is absent, treat as enabled.

`.planning/config.json` has `workflow.nyquist_validation: false`. **This section is skipped.**

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled). Omit only if explicitly `false` in config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `access_token` cached with refresh-on-42001; token fetch uses `corpsecret` over HTTPS |
| V3 Session Management | no | Not a user session system |
| V4 Access Control | no | No role-based access in SDK scope |
| V5 Input Validation | yes | SHA1 signature verification + timestamp freshness on callbacks; validate `errcode` from WeCom APIs |
| V6 Cryptography | yes | AES-256-CBC via Node.js `crypto`; SHA1 via `crypto.createHash`; never hand-roll |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Callback replay attack | Spoofing | SHA1 signature verification + timestamp freshness check (±5 min) |
| Duplicate message processing during WS/HTTP transition | Information Disclosure / DoS | Short-lived `msgid` deduplication `Set` with TTL |
| Token theft / leakage | Information Disclosure | In-memory cache only; no persistent token storage; all API calls over HTTPS |
| Token refresh race condition | Denial of Service | Promise-based refresh lock prevents thundering herd |

## Sources

### Primary (HIGH confidence)
- WeCom official developer docs (`developer.work.weixin.qq.com/document/path/90236`) — `message/send` endpoint and `access_token` usage [VERIFIED: curl extraction]
- WeCom official developer docs (`developer.work.weixin.qq.com/document/path/91039`) — `gettoken` endpoint, `expires_in` = 7200s [VERIFIED: curl extraction]
- WeCom official developer docs (`developer.work.weixin.qq.com/document/path/90238`) — callback signature verification, AES decryption, `msg_signature` composition [VERIFIED: curl extraction]
- Codebase audit (`src/wecom-crypto/index.ts`, `src/api.ts`, `src/bot/index.ts`, `src/message-handler.ts`) — existing reusable assets and patterns [VERIFIED: direct file read]

### Secondary (MEDIUM confidence)
- `npm view` registry checks for axios, ws, eventemitter3, vitest versions [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use and verified against npm registry
- Architecture: HIGH — directly derived from existing codebase patterns and official WeCom docs
- Pitfalls: MEDIUM-HIGH — based on common SDK integration patterns and official callback security model; exact aibot callback envelope format (XML vs JSON) not fully confirmed

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (WeCom APIs are stable; 30 days is appropriate)
