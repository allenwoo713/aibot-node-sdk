---
phase: 02-http-fallback-transport
verified: 2026-04-15T13:51:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
human_verification: []
---

# Phase 2: HTTP Fallback Transport Verification Report

**Phase Goal:** SDK can send and receive messages via WeCom HTTP APIs when WebSocket is unavailable, with unified Transport abstraction
**Verified:** 2026-04-15T13:51:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Transport interface exists with typed event emitter methods and sendText/sendStream | VERIFIED | `src/types/transport.ts` defines `Transport extends EventEmitter<TransportEventMap>` with all required methods |
| 2   | WeComApiClient can fetch access tokens and send text messages via HTTP | VERIFIED | `src/api.ts` has `getAccessToken()` and `sendTextMessage()` calling `qyapi.weixin.qq.com` endpoints |
| 3   | WsTransport wraps WSClient and implements Transport | VERIFIED | `src/transport/ws-transport.ts` composes `WSClient`, forwards events, and delegates `sendText`/`sendStream` to `replyStream` |
| 4   | MessageHandler accepts EventEmitter instead of hardcoded WSClient type | VERIFIED | `src/message-handler.ts` uses `EventEmitter<WSClientEventMap>`; no `import type { WSClient }` remains |
| 5   | HttpTransport fetches and caches access tokens with Promise-based refresh lock | VERIFIED | `TokenCache` in `src/transport/http-transport.ts` uses `refreshPromise` to serialize concurrent fetches; tests confirm single fetch under concurrency |
| 6   | HttpTransport sends text messages via WeCom HTTP API and retries once on 42001 | VERIFIED | `sendText` calls `apiClient.sendTextMessage`; catches 42001, clears cache, and retries once; unit test passes |
| 7   | HTTP callback handler verifies SHA1 signatures, checks timestamp freshness, decrypts AES, and normalizes to WsFrame | VERIFIED | `handleCallback` in `src/transport/http-callback.ts` performs all four checks; callback tests pass for each |
| 8   | FallbackTransport routes outbound messages to primary or fallback and deduplicates inbound messages across both paths | VERIFIED | `FallbackTransport` tracks `primaryActive`, routes `sendText`/`sendStream` accordingly, and uses `seenMsgIds` with 5-minute TTL for dedup; tests pass |
| 9   | BotOrchestrator accepts optional Transport injection and defaults to WsTransport for backward compatibility | VERIFIED | Constructor signature is `constructor(config: BotConfig, transport?: Transport)` with `transport ?? new WsTransport(...)` |
| 10  | BotOrchestrator sends replies via Transport.sendText and chunks via Transport.sendStream | VERIFIED | `src/bot/index.ts` calls `this.transport.sendText` and `this.transport.sendStream`; no `WSClient` references remain |
| 11  | Entry point instantiates FallbackTransport with WsTransport primary and HttpTransport fallback | VERIFIED | `src/bot/entry.ts` creates `FallbackTransport(wsTransport, httpTransport, config.logger)` and passes it to `BotOrchestrator` |
| 12  | SDK barrel exports all transport classes and types | VERIFIED | `src/index.ts` exports `Transport`, `TransportEventMap`, `CallbackPayload`, `CallbackResponse`, `WsTransport`, `HttpTransport`, `FallbackTransport`, `handleCallback` |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/types/transport.ts` | Transport interface, TransportEventMap, callback types | VERIFIED | All interfaces present and exported |
| `src/api.ts` | getAccessToken and sendTextMessage methods | VERIFIED | Methods implemented with WeCom endpoint URLs |
| `src/transport/ws-transport.ts` | WSClient wrapper implementing Transport | VERIFIED | Event forwarding and delegation correct |
| `src/transport/http-transport.ts` | HttpTransport with TokenCache | VERIFIED | TokenCache exported; refresh lock and 42001 retry implemented |
| `src/transport/http-callback.ts` | framework-agnostic callback handler | VERIFIED | Signature verification, timestamp check, AES decrypt, dedup, and frame normalization all present |
| `src/transport/fallback-transport.ts` | primary/fallback routing and cross-transport dedup | VERIFIED | primaryActive tracking, send routing, and isDuplicate with TTL all present |
| `src/transport/index.ts` | transport barrel exports | VERIFIED | Exports all transport symbols |
| `src/bot/index.ts` | transport-agnostic BotOrchestrator | VERIFIED | Uses `Transport` interface; defaults to `WsTransport` |
| `src/bot/entry.ts` | fallback transport wiring | VERIFIED | Wires `FallbackTransport` with `WsTransport` + `HttpTransport` |
| `src/index.ts` | SDK public exports | VERIFIED | Barrel includes all new transport types and classes |
| `src/config/index.ts` | extended BotConfig | VERIFIED | `corpId?: string` and `agentId?: string` with fallback to `BOT_ID` |
| `.env.example` | CORP_ID and AGENT_ID documentation | VERIFIED | Documented in optional WeCom HTTP API Credentials section |
| `src/transport/http-transport.test.ts` | HttpTransport and TokenCache tests | VERIFIED | 4 test cases pass |
| `src/transport/http-callback.test.ts` | callback handler tests | VERIFIED | 5 test cases pass |
| `src/transport/fallback-transport.test.ts` | fallback routing and dedup tests | VERIFIED | 5 test cases pass |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `src/transport/ws-transport.ts` | `src/client.ts` | internal WSClient composition | WIRED | `new WSClient(options)` in constructor |
| `src/api.ts` | `https://qyapi.weixin.qq.com` | axios HTTP calls | WIRED | GET_TOKEN_URL and SEND_MSG_URL constants |
| `src/transport/http-transport.ts` | `src/api.ts` | WeComApiClient.getAccessToken / sendTextMessage | WIRED | `this.apiClient = new WeComApiClient(...)`; `tokenCache` and `sendText` both use it |
| `src/transport/http-callback.ts` | `src/wecom-crypto/index.ts` | WecomCrypto.verifySignature and decrypt | WIRED | Imports and calls `crypto.verifySignature` and `crypto.decrypt` |
| `src/transport/fallback-transport.ts` | `src/transport/ws-transport.ts` | primary transport composition | WIRED | Constructor accepts `WsTransport` as `primary` |
| `src/bot/index.ts` | `src/transport/index.ts` | Transport interface import | WIRED | `import type { Transport } from '../transport'` |
| `src/bot/entry.ts` | `src/transport/fallback-transport.ts` | FallbackTransport instantiation | WIRED | `new FallbackTransport(wsTransport, httpTransport, config.logger)` |
| `src/transport/http-transport.test.ts` | `src/transport/http-transport.ts` | direct import | WIRED | Imports `HttpTransport` and `TokenCache` |
| `src/transport/fallback-transport.test.ts` | `src/transport/fallback-transport.ts` | direct import | WIRED | Imports `FallbackTransport` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `HttpTransport.sendText` | `token` | `TokenCache.getToken()` -> `api.getAccessToken()` | Yes (HTTP API response) | FLOWING |
| `HttpTransport.sendStream` | `streamBuffers` | Internal Map accumulated across calls | Yes (buffers chunks until finish) | FLOWING |
| `handleCallback` | `frame` | `normalizeCallbackToFrame(inner)` after decrypt | Yes (decrypted payload from crypto) | FLOWING |
| `FallbackTransport` | `primaryActive` | `primary` transport `connected`/`disconnected` events | Yes (event-driven state toggle) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All tests pass | `npx vitest run` | 57/57 tests passed | PASS |
| TypeScript compilation | `npx tsc --noEmit` | No errors | PASS |
| SDK barrel exports loadable | `npx tsx -e "import { WsTransport, HttpTransport, FallbackTransport, handleCallback } from './src'"` | `function function function function` | PASS |
| BotOrchestrator + config loadable | `npx tsx -e "import { BotOrchestrator } from './src/bot'; import { loadConfig } from './src/config';"` | `function function` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| TRANS-01 | 02-01, 02-02 | WeCom HTTP API send message fallback | SATISFIED | `HttpTransport.sendText` -> `WeComApiClient.sendTextMessage` |
| TRANS-02 | 02-02 | access_token memory cache and auto-refresh | SATISFIED | `TokenCache` with `refreshPromise` and expiry check |
| TRANS-03 | 02-02 | Framework-agnostic HTTP callback handler | SATISFIED | `handleCallback` exported and accepts payload/crypto/emitter |
| TRANS-04 | 02-02 | SHA1 signature verification and timestamp freshness | SATISFIED | `verifySignature` + `Math.abs(now - ts) > 300` checks |
| TRANS-05 | 02-02 | AES decrypt and normalize to WsFrame | SATISFIED | `crypto.decrypt` then `normalizeCallbackToFrame` -> `MessageHandler.handleFrame` |
| COMPAT-03 | 02-01, 02-03 | Transport interface; BotOrchestrator transport-agnostic | SATISFIED | `Transport` interface used throughout; `BotOrchestrator` no longer references `WSClient` |
| TEST-02 | 02-04 | Unit/integration tests for HTTP fallback | SATISFIED | 14 transport tests pass covering TokenCache, 42001 retry, callback, dedup, routing |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/transport/http-callback.ts` | 32 | `return null` in `extractEncrypt` | Info | Expected early-return when no Encrypt field found; not a stub |
| `src/bot/entry.ts` | 27 | `console.log` in shutdown handler | Info | Acceptable for CLI entry point signal handling |

No TODO/FIXME/placeholder comments, empty implementations, hardcoded empty data, or disconnected props were found.

### Human Verification Required

None. All behaviors are verifiable through automated tests and static analysis.

### Gaps Summary

No gaps identified. All 12 observable truths are verified, all 15 artifacts exist and are substantive, all 9 key links are wired, data flows are real, all 7 requirements are satisfied, tests pass (57/57), and TypeScript compiles cleanly.

---

_Verified: 2026-04-15T13:51:00Z_
_Verifier: Claude (gsd-verifier)_
