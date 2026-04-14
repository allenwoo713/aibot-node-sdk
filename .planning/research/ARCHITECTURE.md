# Architecture Research: Async Persistence and HTTP Fallback

**Domain:** Event-driven messaging SDK (WeCom AI bot)
**Researched:** 2026-04-14
**Confidence:** HIGH

## Standard Architecture

### System Overview

The existing SDK is an event-driven, layered architecture with WebSocket as the primary transport. The goal is to introduce two capabilities without breaking existing consumers:

1. **Async persistence** — replace synchronous `fs` calls in `ConversationStore` with async I/O.
2. **HTTP fallback transport** — receive and send messages via WeCom push/callback APIs when WebSocket is unavailable.

The recommended architecture keeps WebSocket as the primary path and treats HTTP as a transparent fallback, unified at the message-frame layer.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Consumer / Bot Layer                          │
│  ┌─────────────────┐                                                │
│  │ BotOrchestrator │◄───────────────────────────────────────────────┤
│  └─────────────────┘                                                │
├─────────────────────────────────────────────────────────────────────┤
│                        SDK Public API Layer                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │    WSClient     │◄──│  MessageHandler │◄──│ TransportRouter │   │
│  │   (existing)    │   │   (existing)    │   │    (new)        │   │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                        Transport Abstraction Layer                   │
│  ┌─────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ WsConnectionManager │   │         HttpTransportManager        │  │
│  │     (existing)      │   │              (new)                  │  │
│  └─────────────────────┘   └─────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                        Persistence Layer                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              ConversationStore (async I/O)                  │    │
│  │         ┌──────────────┐         ┌──────────────┐           │    │
│  │         │  In-Memory   │◄───────►│  Async File  │           │    │
│  │         │    Cache     │         │    Store     │           │    │
│  │         └──────────────┘         └──────────────┘           │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| `TransportRouter` (new) | Decide whether to use WebSocket or HTTP for a given send; route inbound HTTP callbacks into the same `MessageHandler` pipeline | Thin coordinator, no business logic |
| `HttpTransportManager` (new) | Send messages via WeCom HTTP APIs; expose an Express/Fastify handler (or a generic `handleRequest(req, res)` function) for inbound push callbacks | Must validate WeCom signatures, decrypt payloads, and emit `WsFrame`-compatible objects |
| `WsConnectionManager` (existing) | Maintain WebSocket lifecycle, auth, heartbeat, reply queues | Unchanged except for optional integration with `TransportRouter` |
| `MessageHandler` (existing) | Parse frames and emit typed events on `WSClient` | Must accept frames from both WebSocket and HTTP paths |
| `ConversationStore` (modified) | In-memory LRU/TTL cache with async JSON persistence | API surface becomes async; backward-compatible wrapper provided |
| `BotOrchestrator` (existing) | Listen to events, call AI adapter, manage replies | Uses `TransportRouter` instead of calling `WSClient` reply methods directly |

## Recommended Project Structure

```
src/
├── transport/              # NEW: Transport abstraction
│   ├── index.ts            # TransportRouter + unified types
│   ├── ws/                 # (moved from src/ws.ts in future)
│   │   └── connection-manager.ts
│   └── http/               # NEW: HTTP fallback
│       ├── manager.ts      # HttpTransportManager
│       ├── webhook-handler.ts  # inbound push handler
│       └── signature.ts    # WeCom signature verification
├── client.ts               # WSClient (minimal changes)
├── message-handler.ts      # unchanged
├── memory.ts               # async ConversationStore
├── memory-sync.ts          # NEW: thin sync wrapper for backward compat
├── bot/
│   ├── index.ts            # BotOrchestrator (uses TransportRouter)
│   └── entry.ts            # service entry (wires HTTP server if configured)
├── ai/                     # unchanged
├── types/                  # add transport types
├── api.ts                  # WeComApiClient (add HTTP message send methods)
└── index.ts                # exports
```

### Structure Rationale

- **`transport/`:** Isolates transport concerns so WebSocket and HTTP can evolve independently. The router is the single point where fallback logic lives.
- **`memory.ts` / `memory-sync.ts`:** Keeps the async implementation clean while providing a deprecated sync wrapper for existing consumers.
- **`api.ts` expansion:** `WeComApiClient` already handles HTTP file downloads; adding message-send methods keeps all WeCom HTTP API calls in one place.
- **`bot/index.ts`:** The orchestrator should not know whether a reply went out over WebSocket or HTTP. It delegates to the transport abstraction.

## Architectural Patterns

### Pattern 1: Transport Abstraction with Transparent Fallback

**What:** A `TransportRouter` exposes the same reply/send API regardless of whether the underlying transport is WebSocket or HTTP. It prefers WebSocket when connected and automatically falls back to HTTP when the socket is down or a send fails.

**When to use:** When the primary transport is real-time but availability must be guaranteed.

**Trade-offs:**
- Pros: Consumers write one code path; fallback is automatic.
- Cons: HTTP and WebSocket have different latency and ack semantics; the router must surface delivery status clearly (e.g., `delivered: true/false`, `transport: 'ws' | 'http'`).

**Example:**
```typescript
export interface TransportSendResult {
  transport: 'ws' | 'http';
  delivered: boolean;
  ackFrame?: WsFrame;        // WebSocket ack
  httpResponse?: unknown;    // HTTP API response body
}

export class TransportRouter {
  constructor(
    private ws: WsConnectionManager,
    private http: HttpTransportManager,
  ) {}

  async sendReply(reqId: string, body: unknown): Promise<TransportSendResult> {
    if (this.ws.isConnected) {
      try {
        const ack = await this.ws.sendReply(reqId, body);
        return { transport: 'ws', delivered: true, ackFrame: ack };
      } catch (err) {
        this.logger.warn('WS send failed, falling back to HTTP', err);
      }
    }
    const httpResult = await this.http.sendReply(reqId, body);
    return { transport: 'http', delivered: httpResult.errcode === 0, httpResponse: httpResult };
  }
}
```

### Pattern 2: Async Persistence with In-Memory Cache

**What:** `ConversationStore` keeps its existing in-memory `Map` for hot data but performs all disk I/O asynchronously. Reads are always from memory (fast); writes are debounced or queued to disk.

**When to use:** When you need to eliminate blocking I/O without adding a full database dependency.

**Trade-offs:**
- Pros: Simple, no new infrastructure; preserves existing TTL/LRU behavior.
- Cons: Crash before flush loses the last few writes; not horizontally scalable.

**Example:**
```typescript
export class ConversationStore {
  private store = new Map<string, ConversationRecord>();
  private savePromise: Promise<void> | null = null;
  private pendingSave = false;

  async append(conversationId: string, message: Omit<HistoryMessage, 'timestamp'>): Promise<void> {
    // ... update in-memory store ...
    await this.scheduleSave();
  }

  private async scheduleSave(): Promise<void> {
    if (this.savePromise) {
      this.pendingSave = true;
      return;
    }
    this.savePromise = this.doSave();
    await this.savePromise;
    this.savePromise = null;
    if (this.pendingSave) {
      this.pendingSave = false;
      await this.scheduleSave();
    }
  }

  private async doSave(): Promise<void> {
    const data = Object.fromEntries(this.store.entries());
    await fs.promises.writeFile(this.config.persistencePath, JSON.stringify(data), 'utf-8');
  }
}
```

### Pattern 3: Unified Inbound Frame Pipeline

**What:** Both WebSocket and HTTP inbound messages are normalized into `WsFrame` objects and fed through `MessageHandler.handleFrame`. This guarantees that `BotOrchestrator` sees the same events regardless of transport.

**When to use:** When adding a second inbound channel to an existing event-driven system.

**Trade-offs:**
- Pros: Zero changes to event consumers; single place to add logging/metrics later.
- Cons: HTTP callbacks may carry slightly different metadata (e.g., no `req_id` in some WeCom push modes), requiring careful normalization.

**Example:**
```typescript
// In HttpTransportManager
async handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const payload = await this.verifyAndDecrypt(req);
  const frame: WsFrame = {
    cmd: WsCmd.CALLBACK,
    headers: { req_id: payload.msgid || generateReqId('http') },
    body: payload,
  };
  this.onFrame?.(frame); // routed to MessageHandler
  res.end('success');
}
```

## Data Flow

### Inbound Message Flow (WebSocket Primary)

```
WeCom Server
    ↓ (WebSocket frame)
WsConnectionManager
    ↓ (frame)
TransportRouter
    ↓ (frame)
MessageHandler.handleFrame
    ↓ (typed event)
WSClient.emit('message.text')
    ↓
BotOrchestrator
    ↓
ConversationStore (async load/append)
    ↓
AnthropicApiAdapter
    ↓
TransportRouter.sendReply
    ↓
WsConnectionManager.sendReply
    ↓
WeCom Server
```

### Inbound Message Flow (HTTP Fallback)

```
WeCom Server
    ↓ (HTTP POST callback)
HttpTransportManager.handleWebhook
    ↓ (verify signature, decrypt, normalize to WsFrame)
TransportRouter
    ↓ (frame)
MessageHandler.handleFrame
    ↓ (typed event)
WSClient.emit('message.text')
    ↓
BotOrchestrator
    ↓
ConversationStore (async load/append)
    ↓
AnthropicApiAdapter
    ↓
TransportRouter.sendReply
    ↓ (detects WS down)
HttpTransportManager.sendReply
    ↓ (WeCom HTTP API)
WeCom Server
```

### Outbound Send Flow (Active Push)

```
BotOrchestrator (or consumer)
    ↓
TransportRouter.sendMessage(chatid, body)
    ├─► WebSocket connected? ──► WsConnectionManager.sendMessage ──► WS
    └─► else ─────────────────► HttpTransportManager.sendMessage ──► HTTP API
```

### Persistence Flow

```
BotOrchestrator
    ↓
ConversationStore.append / get / buildMessages
    ├─► immediate in-memory Map update
    └─► async write to JSON file (queued, non-blocking)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single Node (current) | Async file I/O + optional HTTP webhook endpoint on the same process. No external dependencies. |
| Multi-Node / Container | HTTP webhook mode becomes required because WebSocket is single-connection. `ConversationStore` JSON file must move to a shared volume or be replaced with Redis/database. |
| High Throughput | Replace JSON file persistence with a proper database; add a message queue between HTTP webhook receiver and bot handler. |

### Scaling Priorities

1. **First bottleneck:** Blocking `fs.writeFileSync` in `ConversationStore` under concurrent conversations. **Fix:** Async I/O with write coalescing (the immediate goal).
2. **Second bottleneck:** Single WebSocket connection limits horizontal scaling. **Fix:** HTTP fallback webhook mode allows multiple container replicas to receive messages.

## Anti-Patterns

### Anti-Pattern 1: Dual Event Streams

**What people do:** Create a separate event emitter or handler path for HTTP messages, duplicating bot logic.
**Why it's wrong:** Business logic drifts between channels; bugs fixed in one path are missed in the other.
**Do this instead:** Normalize HTTP payloads into `WsFrame` and route them through the existing `MessageHandler`.

### Anti-Pattern 2: Synchronous Fallback Detection

**What people do:** Check `ws.isConnected` synchronously, then block while opening an HTTP connection before returning.
**Why it's wrong:** Wastes time if the WS send is about to fail; better to attempt WS send and catch the failure.
**Do this instead:** Attempt WebSocket send first; catch and fallback to HTTP.

### Anti-Pattern 3: Leaking Transport Details to BotOrchestrator

**What people do:** Bot logic branches on `if (transport === 'http')` to change reply behavior.
**Why it's wrong:** Violates abstraction; makes the bot harder to test and evolve.
**Do this instead:** `BotOrchestrator` should only interact with `TransportRouter`. Transport-specific quirks (e.g., HTTP lacks streaming) are handled inside the router or HTTP manager.

### Anti-Pattern 4: Fire-and-Forget Persistence Without Error Handling

**What people do:** Make `save()` async but never `await` it, silently losing write errors.
**Why it's wrong:** Disk-full or permission errors go unnoticed; state diverges from expectations.
**Do this instead:** `await` or `.catch()` async saves, log errors, and optionally surface them to the caller or a health-check endpoint.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| WeCom WebSocket | `ws` library, frame-based protocol | Primary transport; requires auth frame and heartbeat |
| WeCom HTTP Push API | Inbound POST webhook | Must verify SHA1 signature and decrypt AES payload |
| WeCom HTTP Message API | Outbound POST (e.g., `/cgi-bin/message/send`) | Used when WebSocket is unavailable; requires access token |
| Anthropic Messages API | HTTP via `@anthropic-ai/sdk` | Unchanged |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `TransportRouter` ↔ `WsConnectionManager` | Direct method calls | Router checks `isConnected` and delegates `sendReply` |
| `TransportRouter` ↔ `HttpTransportManager` | Direct method calls | HTTP manager handles token refresh and retry |
| `MessageHandler` ↔ `TransportRouter` | Callback (`onFrame`) | Decouples frame parsing from transport origin |
| `BotOrchestrator` ↔ `ConversationStore` | Async method calls | Store API becomes `Promise`-based |

## Suggested Build Order

Based on dependencies between components:

1. **Async `ConversationStore`**
   - Convert `load`/`save`/`append`/`clear` to async.
   - Add `memory-sync.ts` backward-compatible wrapper.
   - Update `BotOrchestrator` to `await` store calls.
   - Update tests.

2. **`WeComApiClient` message-send methods**
   - Add HTTP message send / media upload methods.
   - Add access-token caching/refresh logic if not present.
   - Unit test with mocked axios.

3. **`HttpTransportManager`**
   - Implement outbound HTTP message sending.
   - Implement inbound webhook handler with signature verification and AES decryption.
   - Unit test both directions.

4. **`TransportRouter`**
   - Integrate `WsConnectionManager` and `HttpTransportManager`.
   - Implement fallback logic and result normalization.
   - Update `BotOrchestrator` to use the router for all replies.

5. **Integration / E2E tests**
   - Test WebSocket primary path unchanged.
   - Test HTTP fallback path end-to-end.
   - Test mixed scenario (WS down mid-conversation).

## Sources

- Existing codebase analysis (`src/client.ts`, `src/ws.ts`, `src/memory.ts`, `src/bot/index.ts`, `src/api.ts`, `src/message-handler.ts`)
- WeCom official documentation conventions for push/callback APIs (implied by `.planning/PROJECT.md` decisions)
- `.planning/codebase/ARCHITECTURE.md` existing architecture description
- `.planning/codebase/STRUCTURE.md` codebase layout

---
*Architecture research for: aibot-node-sdk async persistence and HTTP fallback*
*Researched: 2026-04-14*
