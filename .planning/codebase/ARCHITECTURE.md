# Architecture

**Analysis Date:** 2026-04-14

## Pattern Overview

**Overall:** Event-driven SDK with layered abstraction, plus an optional bot orchestrator layer on top.

**Key Characteristics:**
- Typed EventEmitter pattern for all inbound message/event dispatch
- Separation between transport (WebSocket), protocol (frame types), and business logic (bot orchestrator)
- Queue-based serial reply handling per `req_id` to guarantee ordered delivery
- Retry with exponential backoff for reconnections and auth failures
- Pluggable AI backend adapter (currently Anthropic-only)

## Layers

**SDK Core (Transport & Protocol):**
- Purpose: Maintain WebSocket connection, authenticate, send/receive frames, queue replies
- Location: `src/client.ts`, `src/ws.ts`, `src/api.ts`
- Contains: `WSClient`, `WsConnectionManager`, `WeComApiClient`
- Depends on: `ws`, `axios`, `eventemitter3`, Node.js `crypto`
- Used by: Bot orchestrator, direct SDK consumers, examples

**Message Handling Layer:**
- Purpose: Parse WebSocket frames and emit typed events
- Location: `src/message-handler.ts`
- Contains: `MessageHandler`
- Depends on: `WSClient` (as emitter), type definitions
- Used by: `WSClient`

**Type Definitions Layer:**
- Purpose: Strongly typed contracts for all frames, messages, events, and template cards
- Location: `src/types/`
- Contains: `api.ts`, `message.ts`, `event.ts`, `config.ts`, `common.ts`, `index.ts`
- Depends on: `ws` types
- Used by: All other layers

**Cryptography Layer:**
- Purpose: AES-256-CBC decrypt for downloaded files, SHA1 signature verification
- Location: `src/wecom-crypto/`, `src/crypto.ts`
- Contains: `WecomCrypto`, `decryptFile`, `decodeEncodingAESKey`, `pkcs7Pad`, `pkcs7Unpad`
- Depends on: Node.js `crypto`
- Used by: `WSClient` (file download decryption), exported for consumers

**Bot Orchestrator Layer:**
- Purpose: High-level AI bot that connects WeCom messages to Anthropic responses with memory and rate limiting
- Location: `src/bot/`
- Contains: `BotOrchestrator`, `entry.ts`
- Depends on: `WSClient`, `ConversationStore`, `AnthropicApiAdapter`, `loadConfig`
- Used by: Docker runtime (`dist/bot/entry.js`)

**Memory Layer:**
- Purpose: In-memory conversation history with TTL, LRU, sliding window, and JSON persistence
- Location: `src/memory.ts`
- Contains: `ConversationStore`
- Depends on: Node.js `fs`
- Used by: `BotOrchestrator`

**AI Adapter Layer:**
- Purpose: Abstract AI backend; currently implements Anthropic Messages API
- Location: `src/ai/`
- Contains: `AiBackend` interface, `AnthropicApiAdapter`
- Depends on: `@anthropic-ai/sdk`
- Used by: `BotOrchestrator`

**Configuration Layer:**
- Purpose: Load and validate environment-based bot configuration
- Location: `src/config/index.ts`
- Contains: `BotConfig`, `loadConfig`
- Depends on: Node.js `fs`, `path`, `process.env`
- Used by: `BotOrchestrator`, `entry.ts`

## Data Flow

**Inbound Message Flow:**

1. WeCom server pushes a frame over WebSocket to `WsConnectionManager` (`src/ws.ts`)
2. `WsConnectionManager` parses JSON and routes by `cmd` / `req_id` in `handleFrame`
3. Message/event frames are passed to `MessageHandler.handleFrame` (`src/message-handler.ts`)
4. `MessageHandler` emits typed events (e.g., `message.text`) on `WSClient` (`src/client.ts`)
5. `BotOrchestrator` listens on `message.text`, classifies contact type, checks rate limits
6. `ConversationStore` loads history and appends the new exchange
7. `AnthropicApiAdapter` sends messages to Anthropic API and returns the reply
8. `chunkMessage` splits long replies; `WSClient.replyStream` sends chunks back through WebSocket

**Outbound Reply Flow:**

1. Caller invokes `wsClient.replyStream()` or `wsClient.sendMessage()`
2. `WSClient` delegates to `WsConnectionManager.sendReply()`
3. Frame is enqueued per `req_id` and processed serially in `processReplyQueue`
4. Frame is sent over WebSocket; a pending ack is registered with timeout
5. On receiving the server ack, `handleReplyAck` resolves the promise and dequeues the next frame

## Key Abstractions

**WsFrame<T>:**
- Purpose: Universal envelope for all WebSocket communication
- Defined in: `src/types/api.ts`
- Pattern: `{ cmd?, headers: { req_id }, body?: T, errcode?, errmsg? }`

**Logger Interface:**
- Purpose: Decouple logging from console for testability and customization
- Defined in: `src/types/common.ts`
- Pattern: `debug`, `info`, `warn`, `error` methods

**AiBackend Interface:**
- Purpose: Allow swapping AI providers without changing bot logic
- Defined in: `src/ai/adapter.ts`
- Pattern: `chat(options: ChatOptions): Promise<ChatResult>`

## Entry Points

**SDK Library Entry:**
- Location: `src/index.ts`
- Triggers: Imported as a library (`@wecom/aibot-node-sdk`)
- Responsibilities: Exports `WSClient`, `WeComApiClient`, `WsConnectionManager`, `MessageHandler`, crypto utilities, types

**Bot Service Entry:**
- Location: `src/bot/entry.ts`
- Triggers: `npm start`, `node dist/bot/entry.js`, Docker CMD
- Responsibilities: Load config, instantiate `BotOrchestrator`, start connection, handle SIGINT/SIGTERM

## Error Handling

**Strategy:** Layer-specific error handling with typed errors for transport failures.

**Patterns:**
- Custom error classes: `WSAuthFailureError`, `WSReconnectExhaustedError` (`src/types/common.ts`)
- Auth failures trigger separate retry counter from connection drops (`src/ws.ts`)
- AI adapter catches API errors and returns a fallback message with `error: true` (`src/ai/api-adapter.ts`)
- File download errors are logged and re-thrown to caller (`src/client.ts`)
- Best-effort persistence: `ConversationStore` silently ignores corrupt state files

## Cross-Cutting Concerns

**Logging:** Custom `Logger` interface injected into `WSClient`, `WsConnectionManager`, `MessageHandler`, `WeComApiClient`

**Validation:** `loadConfig` validates required env vars and parses integers with strict checks (`src/config/index.ts`)

**Authentication:** Frame-based (`aibot_subscribe`) over WebSocket; no HTTP middleware or OAuth flow

**Rate Limiting:** Per-conversation in-memory token bucket in `BotOrchestrator` (`src/bot/index.ts`)

---

*Architecture analysis: 2026-04-14*
