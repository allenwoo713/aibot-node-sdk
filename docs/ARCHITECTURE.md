<!-- generated-by: gsd-doc-writer -->

# Architecture

This document describes the high-level architecture of `@wecom/aibot-node-sdk`, a TypeScript SDK and bot service for WeCom (WeChat Work) integration with an AI orchestrator layer powered by Anthropic Claude.

## System Overview

The SDK provides a production-ready bridge between WeCom's real-time messaging infrastructure and AI-powered conversation replies. At its core, the system maintains a long-lived WebSocket connection to WeCom, authenticates with bot credentials, receives typed message and event frames, and dispatches them to an extensible AI backend adapter. The bot service layer adds conversation memory (with TTL, LRU eviction, and sliding window truncation), per-conversation rate limiting, and persistent state storage via JSON or SQLite backends. All communication with WeCom uses a typed frame protocol over WebSocket, with a fallback HTTP transport for resilience.

## Component Diagram

```
+-----------------------------------------------------------+
|                        Bot Service                         |
|  +-------------------+  +-----------------------------+   |
|  | BotOrchestrator   |  | ConversationStore           |   |
|  | (src/bot/index.ts)|  | (src/memory.ts)             |   |
|  +--------+----------+  +-----------------------------+   |
|           |                                               |
|           v                                               |
|  +-------------------+  +-----------------------------+   |
|  | Transport (iface) |  | AnthropicApiAdapter         |   |
|  | (src/types/       |  | (src/ai/api-adapter.ts)     |   |
|  |  transport.ts)    |  +-----------------------------+   |
|  +--------+----------+                                    |
+-----------|-----------------------------------------------+
            |
+-----------|-----------------------------------------------+
|           v         SDK Library Layer                      |
|  +-------------------+  +-----------------------------+   |
|  | FallbackTransport |  | WSClient                    |   |
|  | (src/transport/   |  | (src/client.ts)             |   |
|  |  fallback-        |  +-----------------------------+   |
|  |  transport.ts)    |           |                       |
|  +--------+----------+           v                       |
|           |            +-----------------------------+   |
|           |            | WsConnectionManager         |   |
|           |            | (src/ws.ts)                 |   |
|           |            +-----------------------------+   |
|           |                       |                       |
|           v                       v                       |
|  +-------------------+  +-----------------------------+   |
|  | HttpTransport     |  | MessageHandler              |   |
|  | (src/transport/   |  | (src/message-handler.ts)    |   |
|  |  http-transport.ts)| +-----------------------------+   |
|  +--------+----------+                                    |
|           |                                               |
+-----------|-----------------------------------------------+
            |
            v
+-----------------------------------------------------------+
|                     WeCom Platform                         |
|         (WebSocket / HTTP Callback API)                    |
+-----------------------------------------------------------+
```

## Data Flow

A typical text message flows through the system as follows:

1. **WeCom pushes a message** over the WebSocket connection as a JSON frame with `cmd: "aibot_msg_callback"`.
2. **`WsConnectionManager`** receives the raw WebSocket frame, validates it, and invokes the `onMessage` callback.
3. **`WSClient`** forwards the frame to **`MessageHandler`**, which parses the `msgtype` field and emits a typed event (e.g., `message.text`) via `eventemitter3`.
4. If running as a bot service, **`BotOrchestrator`** (via the `Transport` abstraction) listens for `message.text` events.
5. **BotOrchestrator** checks rate limits and `shouldReply` logic (e.g., only reply in single chats or when @mentioned in groups).
6. The user's message is appended to **`ConversationStore`**, which builds the conversation history including a system prompt (differentiated for internal vs. external contacts).
7. **`AnthropicApiAdapter`** sends the history to the Anthropic Messages API, with configurable retries, backoff, and fallback messages on error.
8. The AI reply is chunked via **`chunkMessage`** (respecting multi-byte UTF-8 boundaries) and streamed back to WeCom through `Transport.sendStream`.
9. The assistant reply is appended to **`ConversationStore`**, which persists state asynchronously via the configured backend (`JsonFileBackend` or `SqliteBackend`).

For HTTP callback mode (fallback or standalone):

1. WeCom sends an encrypted XML/JSON payload to the developer's HTTP endpoint.
2. **`handleCallback`** (in `src/transport/http-callback.ts`) verifies the SHA1 signature, decrypts the payload with `WecomCrypto`, and normalizes it into a `WsFrame`.
3. The normalized frame is emitted through the same `Transport` interface, so `BotOrchestrator` handles it identically.

## Key Abstractions

| Abstraction | Description | Location |
|-------------|-------------|----------|
| `WSClient` | High-level SDK entry point that wraps the WebSocket manager, API client, and message handler. Exposes typed events for all message and event types. | `src/client.ts` |
| `WsConnectionManager` | Low-level WebSocket lifecycle manager: connects, authenticates, heartbeat, exponential-backoff reconnect, and per-`req_id` serial reply queues. | `src/ws.ts` |
| `MessageHandler` | Parses incoming `WsFrame` objects and dispatches them as typed `eventemitter3` events based on `msgtype` and `eventtype`. | `src/message-handler.ts` |
| `Transport` | Interface abstracting over WebSocket and HTTP transports. Defines `connect`, `stop`, `sendText`, `sendStream`, and typed events. | `src/types/transport.ts` |
| `FallbackTransport` | Composite transport that prefers WebSocket and falls back to HTTP polling. Deduplicates messages across transports by `msgid`. | `src/transport/fallback-transport.ts` |
| `BotOrchestrator` | High-level bot that wires transport events to AI responses, with memory, rate limiting, and contact-type detection. | `src/bot/index.ts` |
| `ConversationStore` | In-memory conversation history with TTL eviction, LRU cap, sliding window truncation, and pluggable persistence. | `src/memory.ts` |
| `AiBackend` | Interface for pluggable AI providers. `AnthropicApiAdapter` is the sole implementation today. | `src/ai/adapter.ts` |
| `WsFrame<T>` | Universal envelope for all WebSocket communication: `{ cmd?, headers: { req_id }, body?: T, errcode?, errmsg? }`. | `src/types/api.ts` |
| `Logger` | Decoupled logging interface (`debug`, `info`, `warn`, `error`) for testability and customization. | `src/types/common.ts` |
| `PersistenceBackend` | Interface for conversation persistence. Implemented by `JsonFileBackend` and `SqliteBackend`. | `src/persistence/index.ts` |
| `WecomCrypto` | AES-256-CBC encryption/decryption and SHA1 signature verification for WeCom callback payloads. | `src/wecom-crypto/index.ts` |

## Directory Structure Rationale

```
src/
  index.ts              # Public API barrel: exports SDK classes, types, and crypto utilities
  client.ts             # WSClient: high-level facade over transport and protocol layers
  ws.ts                 # WsConnectionManager: WebSocket connection, auth, heartbeat, reconnect
  api.ts                # WeComApiClient: HTTP helper for file downloads and legacy token access
  message-handler.ts    # MessageHandler: frame parsing and event dispatch
  chunker.ts            # UTF-8-safe message chunking for streaming replies
  crypto.ts             # decryptFile: AES-256-CBC file decryption utility
  logger.ts             # DefaultLogger: console-based Logger implementation
  memory.ts             # ConversationStore: in-memory history with persistence
  utils.ts              # generateReqId, generateRandomString helpers
  ai/
    adapter.ts          # AiBackend interface and ChatOptions/ChatResult types
    api-adapter.ts      # AnthropicApiAdapter: Anthropic Messages API integration
  bot/
    index.ts            # BotOrchestrator: AI bot business logic
    entry.ts            # Production entry point: loads config, starts bot, handles shutdown
  config/
    index.ts            # BotConfig interface and loadConfig() from process.env
  persistence/
    index.ts            # PersistenceBackend interface and record types
    json-file-backend.ts# JSON file persistence with atomic write on Unix
    sqlite-backend.ts   # SQLite persistence with WAL mode and JSON migration
  transport/
    ws-transport.ts     # WsTransport: Transport wrapper around WSClient
    http-transport.ts   # HttpTransport: Transport over WeCom HTTP APIs
    fallback-transport.ts# FallbackTransport: primary WS + fallback HTTP with dedup
    http-callback.ts    # handleCallback: WeCom HTTP callback decryption and routing
  types/
    index.ts            # Unified type exports
    api.ts              # WsFrame, WsCmd, reply body types
    message.ts          # MessageType, content interfaces (Text, Image, Voice, etc.)
    event.ts            # EventType, event data interfaces
    config.ts           # WSClientOptions
    common.ts           # Logger, WSAuthFailureError, WSReconnectExhaustedError
    transport.ts        # Transport, TransportEventMap, CallbackPayload/Response
  wecom-crypto/
    index.ts            # WecomCrypto, decodeEncodingAESKey, pkcs7Pad/Unpad
```

The directory layout follows a layered architecture:

- **`types/`** sits at the bottom: pure type definitions used by all other layers.
- **`wecom-crypto/`**, **`logger.ts`**, **`utils.ts`**, **`chunker.ts`** are shared utilities with no upstream dependencies.
- **`ws.ts`**, **`api.ts`**, **`message-handler.ts`** form the transport and protocol layer.
- **`client.ts`** composes the transport layer into the public `WSClient` facade.
- **`transport/`** adapts the SDK layer into the `Transport` interface used by the bot service.
- **`ai/`**, **`memory.ts`**, **`persistence/`**, **`config/`** are bot-service concerns.
- **`bot/`** is the top-level orchestration layer, with `entry.ts` as the runtime entry point.

Tests are co-located with source files (e.g., `chunker.test.ts`, `memory.test.ts`, `bot/index.test.ts`), while E2E tests live in `__tests__/` at the project root.
