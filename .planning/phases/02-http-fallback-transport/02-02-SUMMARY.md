---
phase: 02-http-fallback-transport
plan: 02
subsystem: transport
status: completed
tags: [transport, http, fallback, wecom]
dependencies:
  requires: [02-01]
  provides: [02-03]
tech-stack:
  added: []
  patterns: [Promise-based refresh lock, cross-transport deduplication, adapter pattern]
key-files:
  created:
    - src/transport/http-transport.ts
    - src/transport/http-callback.ts
    - src/transport/fallback-transport.ts
    - src/transport/index.ts
  modified: []
decisions: []
metrics:
  duration: 0
  completed_at: '2026-04-15'
---

# Phase 02 Plan 02: HTTP Fallback Transport Summary

**One-liner:** Implemented HTTP fallback transport with token caching, callback verification/decryption, and primary/fallback routing with cross-transport deduplication.

## What Was Built

- **HttpTransport** (`src/transport/http-transport.ts`): A `Transport` implementation that sends messages over the WeCom HTTP API. Includes `TokenCache` with a `Promise`-based refresh lock to prevent thundering-herd token fetches, and automatic one-time retry on `42001` token expiration.
- **HTTP Callback Handler** (`src/transport/http-callback.ts`): A framework-agnostic `handleCallback` function that verifies SHA1 signatures, enforces timestamp freshness (±300s), decrypts AES payloads, handles both JSON and XML `Encrypt` envelopes, deduplicates by `msgid`, and emits normalized `WsFrame` events via `MessageHandler`.
- **FallbackTransport** (`src/transport/fallback-transport.ts`): Composes a primary `WsTransport` and a fallback `HttpTransport`. Routes outbound messages to the active primary when connected, otherwise to HTTP fallback. Deduplicates inbound messages across both transports using a 5-minute TTL `Map`.
- **Transport Barrel** (`src/transport/index.ts`): Centralized exports for `Transport`, `WsTransport`, `HttpTransport`, `FallbackTransport`, and `handleCallback`.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None - all planned mitigations were implemented as specified.

## Known Stubs

None.

## Self-Check: PASSED

- `src/transport/http-transport.ts` exists and compiles
- `src/transport/http-callback.ts` exists and compiles
- `src/transport/fallback-transport.ts` exists and compiles
- `src/transport/index.ts` exists and compiles
- TypeScript compilation passes (`npx tsc --noEmit`)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `21c0aca` | feat(02-02): create HttpTransport with TokenCache |
| 2 | `071b06b` | feat(02-02): create framework-agnostic HTTP callback handler |
| 3 | `fbffd9e` | feat(02-02): create FallbackTransport and transport barrel |
