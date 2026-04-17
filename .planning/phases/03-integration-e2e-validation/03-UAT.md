# Phase 03 Integration E2E Validation — UAT Report

**Date:** 2026-04-17
**Tester:** Claude + Derek
**Scope:** WebSocket transport, HTTP fallback, message round-trip (AI adapter excluded per request)

---

## 1. Summary

All targeted features passed both unit tests and real-environment smoke tests. The WebSocket long-connection mode was validated end-to-end against the official WeCom gateway using live credentials.

---

## 2. Environment

- **SDK version:** 1.0.6
- **Runtime:** Node.js 22.14.0
- **WeCom Gateway:** `wss://openws.work.weixin.qq.com`
- **Bot ID:** `aibCVWnPvNGAdlaeS7IWd7RltkGRvMLAjG8`
- **AI adapter:** Excluded from this validation

---

## 3. Test Results

### 3.1 Unit Test Suite

Command: `pnpm test` (excluding `src/ai/api-adapter.test.ts`)

| Test File | Tests | Status |
|-----------|-------|--------|
| `src/ws.test.ts` | WS auth / heartbeat / reconnect / queue / ack | PASS |
| `src/transport/ws-transport.test.ts` | Transport event forwarding | PASS |
| `src/transport/http-transport.test.ts` | Token cache / send text / retry on 42001 | PASS |
| `src/transport/fallback-transport.test.ts` | Primary↔fallback switch / cross-transport dedup | PASS |
| `src/transport/http-callback.test.ts` | Signature verify / decrypt / duplicate drop | PASS |
| `src/wecom-crypto.test.ts` | AES-CBC / PKCS7 / SHA1 signature | PASS |
| `src/bot/index.test.ts` | Rate limit / mention filter / contact type detection | PASS |
| `__tests__/bot.e2e.test.ts` | Bot orchestrator E2E | PASS |
| `__tests__/bot.fallback.e2e.test.ts` | Fallback transport E2E | PASS |
| `__tests__/bot.http.e2e.test.ts` | HTTP transport E2E | PASS |
| `__tests__/bot.entry.smoke.test.ts` | Entry point smoke | PASS |
| `src/chunker.test.ts` | Message chunking | PASS |
| `src/memory.test.ts` | ConversationStore TTL / LRU / persistence | PASS |

**Total:** 13 files, 61 tests — **ALL PASS**

### 3.2 Real-Environment WebSocket Smoke Test

Script: `scripts/debug/ws-connect-smoke.mjs`

| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| DNS + TLS handshake | Connect to `wss://openws.work.weixin.qq.com` | Connected in ~270ms | PASS |
| Send `aibot_subscribe` | Auth frame emitted | Auth frame sent | PASS |
| Auth response | `errcode: 0, errmsg: ok` | Authenticated successfully | PASS |
| Heartbeat start | 30s interval timer started | Timer started | PASS |

### 3.3 End-to-End Message Round-Trip

Script: `scripts/debug/echo-bot.mjs` (echo reply without AI call)

| Step | Time | Event | Status |
|------|------|-------|--------|
| User enters chat | 06:28:15 | `enter_chat` event received from `userid: wj` | PASS |
| User sends text | 06:28:25 | `aibot_msg_callback` received: `"hello test"` | PASS |
| SDK replies | 06:28:25 | `sendText` dispatched via WebSocket | PASS |
| Server ack | 06:28:26 | Reply ack received for same `req_id` | PASS |
| User sees reply | — | `"收到你的消息：hello test"` delivered | PASS |

---

## 4. Findings / Gaps

| # | Finding | Severity | Notes |
|---|---------|----------|-------|
| 1 | `package.json` lacks `"type": "module"` | Low | ESM imports from `dist/index.esm.js` trigger a Node.js performance warning; does not affect runtime behavior. |
| 2 | `CORP_ID` / `AGENT_ID` not configured in `.env` | Low | HTTP fallback transport will fallback to `BOT_ID`; full HTTP path not verified with real corp credentials. |
| 3 | Media upload not implemented | Future | Tracked as backlog TODO. Hermes reference code available. |
| 4 | `echo-bot.mjs` and `ws-connect-smoke.mjs` are debug scripts | N/A | Placed under `scripts/debug/` per project convention. User confirmed `.gitignore` already ignores this directory. |

---

## 5. Conclusion

**WebSocket long-connection mode is fully functional against the live WeCom gateway.**

- Authentication succeeds with the provided `BOT_ID` + `SECRET`.
- Inbound message callbacks (`aibot_msg_callback`) are received correctly.
- Outbound replies are sent and acknowledged by the WeCom server.
- The callback-URL domain-registration blocker is **not applicable** to this mode, confirming the architectural decision to use WebSocket as the primary transport.

**Next steps (optional):**
1. Verify AI adapter with a live LLM call (`src/ai/api-adapter.test.ts` or full bot entry).
2. Implement media upload (`aibot_upload_media_init/chunk/finish`) if needed.
3. Clean up `scripts/debug/` before release packaging.

---

VERDICT: **PASS** ✅
