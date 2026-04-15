---
phase: 02-http-fallback-transport
plan: 01
subsystem: transport
tags: [typescript, eventemitter3, axios, websocket, wecom]

requires:
  - phase: 01-async-persistence
    provides: async ConversationStore and BotOrchestrator integration

provides:
  - Transport interface with typed EventEmitter abstraction
  - WeComApiClient token fetch and text message sending over HTTP
  - WsTransport wrapper implementing Transport over WSClient
  - MessageHandler decoupled from WSClient concrete type

affects:
  - 02-http-fallback-transport

tech-stack:
  added: []
  patterns:
    - Adapter pattern for Transport abstraction over WSClient
    - Event-driven architecture with typed EventEmitter forwarding

key-files:
  created:
    - src/types/transport.ts
    - src/transport/ws-transport.ts
  modified:
    - src/types/index.ts
    - src/message-handler.ts
    - src/api.ts

key-decisions:
  - "Transport interface omits WS-specific events (authenticated, reconnecting) to keep abstraction general"
  - "WsTransport forwards all shared events from internal WSClient via looped on/emit binding"
  - "sendText uses generateReqId('stream') to create a one-shot stream reply with finish=true"

patterns-established:
  - "Transport abstraction: all transports implement connect/stop/sendText/sendStream/isConnected"
  - "Event forwarding: wrapper transports proxy events from underlying emitter to self"

requirements-completed:
  - TRANS-01
  - COMPAT-03

# Metrics
duration: 12min
completed: 2026-04-15
---

# Phase 02 Plan 01: Transport Abstraction and HTTP Client Extension Summary

**Transport interface with typed EventEmitter, WeComApiClient token/message methods, and WSClient wrapper enabling future HTTP fallback transport**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-15T05:30:00Z
- **Completed:** 2026-04-15T05:42:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Defined `Transport` interface and `TransportEventMap` in `src/types/transport.ts`
- Extended `WeComApiClient` with `getAccessToken` and `sendTextMessage` using WeCom HTTP APIs
- Created `WsTransport` wrapper that implements `Transport` by delegating to `WSClient`
- Decoupled `MessageHandler` from `WSClient` concrete type to accept any `EventEmitter<WSClientEventMap>`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Transport types and update MessageHandler signature** - `bb81895` (feat)
2. **Task 2: Extend WeComApiClient with token and message sending** - `084f37b` (feat)
3. **Task 3: Create WsTransport wrapper** - `9c7c294` (feat)

## Files Created/Modified
- `src/types/transport.ts` - `Transport` interface, `TransportEventMap`, `CallbackPayload`, `CallbackResponse`
- `src/types/index.ts` - Added re-exports from `./transport`
- `src/message-handler.ts` - Changed `emitter` parameter type from `WSClient` to `EventEmitter<WSClientEventMap>`
- `src/api.ts` - Added `getAccessToken` and `sendTextMessage` methods to `WeComApiClient`
- `src/transport/ws-transport.ts` - `WsTransport` class implementing `Transport` over `WSClient`

## Decisions Made
- Followed plan exactly: `Transport` omits WS-specific events (`authenticated`, `reconnecting`) to remain generic
- `sendText` generates a fresh stream ID internally so callers do not need to manage stream IDs for simple text replies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect type imports in `src/types/transport.ts`**
- **Found during:** Task 3 (TypeScript compilation verification)
- **Issue:** `BaseMessage`, `TextMessage`, `ImageMessage`, etc. were imported from `./event`, but they are exported from `./message`; this caused `TS2459` errors
- **Fix:** Split imports so message types come from `./message` and event types remain from `./event`
- **Files modified:** `src/types/transport.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `9c7c294` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor import correction; no scope creep or design changes.

## Issues Encountered
- TypeScript compilation failed due to incorrect import paths for message types; quickly resolved by correcting imports.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Transport abstraction is ready for HTTP fallback implementation in Plan 02-02
- `WeComApiClient` has the necessary token and message primitives
- `MessageHandler` can now work with any transport emitter

---
*Phase: 02-http-fallback-transport*
*Completed: 2026-04-15*
