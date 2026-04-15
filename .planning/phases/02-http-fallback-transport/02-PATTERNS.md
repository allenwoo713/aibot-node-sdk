# Phase 2: HTTP Fallback Transport - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 10
**Analogs found:** 9 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/transport/index.ts` | interface | request-response | `src/ai/adapter.ts` | exact |
| `src/transport/ws-transport.ts` | service | event-driven | `src/client.ts` | exact |
| `src/transport/http-transport.ts` | service | request-response | `src/api.ts` | role-match |
| `src/transport/http-callback.ts` | utility | transform | `src/message-handler.ts` | role-match |
| `src/types/transport.ts` | model | — | `src/types/api.ts` | exact |
| `src/api.ts` (modify) | service | request-response | `src/api.ts` (self) | exact |
| `src/bot/index.ts` (modify) | controller | event-driven | `src/bot/index.ts` (self) | exact |
| `src/bot/entry.ts` (modify) | config | request-response | `src/bot/entry.ts` (self) | exact |
| `src/index.ts` (modify) | config | — | `src/index.ts` (self) | exact |
| `src/bot/index.test.ts` (modify) | test | — | `src/bot/index.test.ts` (self) | exact |

## Pattern Assignments

### `src/transport/index.ts` (interface, request-response)

**Analog:** `src/ai/adapter.ts`

**Imports pattern** (lines 1-3):
```typescript
import type { ChatOptions, ChatResult } from './adapter';
import type { BotConfig } from '../config';
```

**Core interface pattern** (lines 24-27):
```typescript
export interface AiBackend {
  /** Send a user message and return the AI's text reply. */
  chat(options: ChatOptions): Promise<ChatResult>;
}
```

**Pattern to copy:** Minimal interface with typed methods, JSDoc comments, and Promise return types. Transport interface should extend `EventEmitter<WSClientEventMap>` to preserve typed events.

---

### `src/transport/ws-transport.ts` (service, event-driven)

**Analog:** `src/client.ts`

**Imports pattern** (lines 1-33):
```typescript
import { EventEmitter } from 'eventemitter3';
import type {
  WSClientOptions,
  WSClientEventMap,
  WsFrame,
  WsFrameHeaders,
} from './types';
import { WsCmd } from './types';
import type { Logger } from './types';
import { WeComApiClient } from './api';
import { WsConnectionManager } from './ws';
import { MessageHandler } from './message-handler';
import { DefaultLogger } from './logger';
import { generateReqId } from './utils';
```

**Event emitter pattern** (lines 34-35):
```typescript
export class WSClient extends EventEmitter<WSClientEventMap> {
```

**Lifecycle pattern** (lines 137-165):
```typescript
connect(): this {
  if (this.started) {
    this.logger.warn('Client already connected');
    return this;
  }
  this.logger.info('Establishing WebSocket connection...');
  this.started = true;
  this.wsManager.connect();
  return this;
}

disconnect(): void {
  if (!this.started) {
    this.logger.warn('Client not connected');
    return;
  }
  this.logger.info('Disconnecting...');
  this.started = false;
  this.wsManager.disconnect();
  this.logger.info('Disconnected');
}
```

**Send text pattern** (lines 189-210):
```typescript
replyStream(frame: WsFrameHeaders, streamId: string, content: string, finish: boolean = false): Promise<WsFrame> {
  const stream: StreamReplyBody['stream'] = {
    id: streamId,
    finish,
    content,
  };
  return this.reply(frame, {
    msgtype: 'stream',
    stream,
  });
}
```

**Error handling pattern:** Emit errors via `this.emit('error', error)` rather than throwing, matching `WSClient.onError` callback in `src/ws.ts` (line 121-123).

---

### `src/transport/http-transport.ts` (service, request-response)

**Analog:** `src/api.ts`

**Imports pattern** (lines 1-3):
```typescript
import axios, { AxiosInstance } from 'axios';
import type { Logger } from './types';
```

**Constructor pattern** (lines 8-21):
```typescript
export class WeComApiClient {
  private httpClient: AxiosInstance;
  private logger: Logger;

  constructor(logger: Logger, timeout: number = 10000) {
    this.logger = logger;
    this.httpClient = axios.create({
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
```

**HTTP request pattern** (lines 26-57):
```typescript
async downloadFileRaw(url: string): Promise<{ buffer: Buffer; filename?: string }> {
  this.logger.info('Downloading file...');
  try {
    const response = await this.httpClient.get(url, {
      responseType: 'arraybuffer',
    });
    // ... processing ...
    this.logger.info('File downloaded successfully');
    return { buffer: Buffer.from(response.data), filename };
  } catch (error: any) {
    this.logger.error('File download failed:', error.message);
    throw error;
  }
}
```

**Token refresh lock pattern** (from RESEARCH.md):
```typescript
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
}
```

**Error handling pattern:** Log with `logger.error` then re-throw for caller handling, or return fallback. Follow `AnthropicApiAdapter.chat()` pattern in `src/ai/api-adapter.ts` (lines 52-58) for best-effort fallback:
```typescript
catch (err: any) {
  const errorMessage = err?.message || String(err);
  return {
    content: '服务暂时繁忙，请稍后再试。',
    error: true,
  };
}
```

---

### `src/transport/http-callback.ts` (utility, transform)

**Analog:** `src/message-handler.ts`

**Imports pattern** (lines 1-10):
```typescript
import type {
  BaseMessage,
  WsFrame,
  Logger,
  WSClientEventMap,
} from './types';
import { MessageType, WsCmd } from './types';
import type { EventMessage } from './types';
import type { WSClient } from './client';
```

**Frame normalization pattern** (lines 32-52):
```typescript
handleFrame(frame: WsFrame, emitter: WSClient): void {
  try {
    const body = frame.body;
    if (!body || !body.msgtype) {
      this.logger.warn('Received invalid message format:', JSON.stringify(frame).substring(0, 200));
      return;
    }
    if (frame.cmd === WsCmd.EVENT_CALLBACK) {
      this.handleEventCallback(frame, emitter);
      return;
    }
    this.handleMessageCallback(frame, emitter);
  } catch (error: any) {
    this.logger.error('Failed to handle message:', error.message);
  }
}
```

**Callback-to-frame normalization pattern** (from RESEARCH.md):
```typescript
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

**Crypto verification pattern** (from `src/wecom-crypto/index.ts`, lines 84-97):
```typescript
public computeSignature(timestamp: string, nonce: string, encrypt: string): string {
  const parts = [this.token, timestamp, nonce, encrypt]
    .map((v) => String(v ?? ""))
    .sort();
  return sha1Hex(parts.join(""));
}

public verifySignature(signature: string, timestamp: string, nonce: string, encrypt: string): boolean {
  const expected = this.computeSignature(timestamp, nonce, encrypt);
  return expected === signature;
}
```

---

### `src/types/transport.ts` (model)

**Analog:** `src/types/api.ts`

**Type definition pattern** (lines 47-65):
```typescript
export interface WsFrame<T = any> {
  cmd?: string;
  headers: {
    req_id: string;
    [key: string]: any;
  };
  body?: T;
  errcode?: number;
  errmsg?: string;
}
```

**Constant pattern** (lines 6-33):
```typescript
export const WsCmd = {
  SUBSCRIBE: 'aibot_subscribe',
  HEARTBEAT: 'ping',
  // ...
} as const;
```

**Pattern to copy:** Export `Transport` interface and `TransportEventMap` types alongside command constants. Use `Pick<WsFrame, 'headers'>` for lightweight reply-to references.

---

### `src/api.ts` (modify, service, request-response)

**Analog:** `src/api.ts` (self)

**Extension pattern:** Add methods to existing `WeComApiClient` class:
- `getAccessToken(corpid: string, corpsecret: string)`
- `sendTextMessage(token: string, agentid: string, touser: string, content: string)`

Follow existing constructor and axios instance pattern. Keep `downloadFileRaw` unchanged.

---

### `src/bot/index.ts` (modify, controller, event-driven)

**Analog:** `src/bot/index.ts` (self)

**Constructor injection pattern** (lines 15-35):
```typescript
export class BotOrchestrator {
  private wsClient: WSClient;
  private store: ConversationStore;
  private adapter: AnthropicApiAdapter;
  private config: BotConfig;
  private logger: Logger;
  private rateLimits = new Map<string, RateLimitEntry>();

  constructor(config: BotConfig) {
    this.config = config;
    this.logger = config.logger ?? new DefaultLogger('BotOrchestrator');
    this.wsClient = new WSClient({
      botId: config.botId,
      secret: config.secret,
      ...(config.wsUrl && { wsUrl: config.wsUrl }),
    });
    this.store = new ConversationStore({ ...config, logger: this.logger });
    this.adapter = new AnthropicApiAdapter(config);
    this.setupEventHandlers();
  }
```

**Event handler setup pattern** (lines 45-57):
```typescript
private setupEventHandlers(): void {
  this.wsClient.on('message.text', async (frame: WsFrame<TextMessage>) => {
    try {
      await this.handleTextMessage(frame);
    } catch (err: any) {
      console.error('Bot handler error:', err?.message || String(err));
    }
  });

  this.wsClient.on('error', (err) => {
    console.error('WSClient error:', err.message);
  });
}
```

**Refactor pattern to copy:** Change `private wsClient: WSClient` to `private transport: Transport`, accept optional `transport?: Transport` in constructor, default to `WSClient` wrapper if not provided. Preserve existing `start()`/`stop()` methods.

---

### `src/bot/entry.ts` (modify, config, request-response)

**Analog:** `src/bot/entry.ts` (self)

**Entry point pattern** (lines 1-17):
```typescript
import { loadConfig } from '../config';
import { BotOrchestrator } from '.';

const config = loadConfig();
const bot = new BotOrchestrator(config);

bot.start();

function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down bot...`);
  bot.stop();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

**Refactor pattern:** Instantiate `WsTransport` or `HttpTransport` based on config (or both, wrapped in a fallback transport), then inject into `BotOrchestrator` constructor.

---

### `src/index.ts` (modify, config)

**Analog:** `src/index.ts` (self)

**Barrel export pattern** (lines 1-94):
```typescript
import { WSClient } from './client';

const AiBot = {
  WSClient,
};

export default AiBot;

export { WSClient } from './client';
export { WeComApiClient } from './api';
// ... more named exports
```

**Pattern to copy:** Add named exports for new transport classes and types:
```typescript
export { Transport } from './transport';
export { WsTransport } from './transport/ws-transport';
export { HttpTransport } from './transport/http-transport';
export { handleCallback } from './transport/http-callback';
export type { TransportEventMap, CallbackPayload, CallbackResponse } from './types/transport';
```

---

### `src/bot/index.test.ts` (modify, test)

**Analog:** `src/bot/index.test.ts` (self)

**Test imports pattern** (lines 1-7):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import { BotOrchestrator } from './index';
import type { WsFrame, TextMessage } from '../types';
import fs from 'fs';
import path from 'path';
```

**Mock pattern** (lines 11-22):
```typescript
vi.mock('..', async () => {
  const actual = await vi.importActual('..');
  return {
    ...actual,
    WSClient: class MockWSClient extends EventEmitter {
      connect = vi.fn();
      disconnect = vi.fn();
      replyStream = vi.fn().mockResolvedValue(undefined);
    },
    generateReqId: vi.fn().mockReturnValue('stream-123'),
  };
});
```

**Mock frame factory** (lines 32-45):
```typescript
function createMockFrame(overrides: Partial<TextMessage> = {}): WsFrame<TextMessage> {
  return {
    headers: { req_id: 'req-1' },
    body: {
      msgid: 'm1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'text',
      text: { content: 'Hello bot' },
      ...overrides,
    } as TextMessage,
  };
}
```

**Async test pattern** (lines 80-93):
```typescript
it('replies to single chat text messages', async () => {
  chatMock.mockResolvedValueOnce({ content: 'Hi there' });
  const bot = createBot();
  const frame = createMockFrame();
  (bot as any).wsClient.emit('message.text', frame);
  await new Promise((r) => setTimeout(r, 50));
  expect(chatMock).toHaveBeenCalledTimes(1);
});
```

**Pattern to copy for transport tests:** Mock `Transport` as an `EventEmitter` subclass with `connect`, `stop`, `sendText` methods. Update existing tests to emit on `transport` instead of `wsClient`.

---

## Shared Patterns

### Authentication / Token Refresh
**Source:** `src/api.ts` + RESEARCH.md TokenCache
**Apply to:** `src/transport/http-transport.ts`, `src/api.ts`
```typescript
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
}
```

### Error Handling
**Source:** `src/ai/api-adapter.ts` (lines 52-58)
**Apply to:** `src/transport/http-transport.ts`, `src/transport/http-callback.ts`
```typescript
catch (err: any) {
  const errorMessage = err?.message || String(err);
  return {
    content: '服务暂时繁忙，请稍后再试。',
    error: true,
  };
}
```

### Logging
**Source:** `src/logger.ts` (lines 7-33)
**Apply to:** All new files
```typescript
export class DefaultLogger implements Logger {
  private prefix: string;
  constructor(prefix: string = 'AiBotSDK') {
    this.prefix = prefix;
  }
  debug(message: string, ...args: any[]): void {
    console.debug(`[${this.formatTime()}] [${this.prefix}] [DEBUG] ${message}`, ...args);
  }
  // ... info, warn, error
}
```

### Event Emitter Typed Generics
**Source:** `src/client.ts` (lines 1-35)
**Apply to:** `src/transport/ws-transport.ts`, any class implementing `Transport`
```typescript
import { EventEmitter } from 'eventemitter3';
export class WSClient extends EventEmitter<WSClientEventMap> {
```

### Deduplication Set with TTL
**Source:** RESEARCH.md Common Pitfalls
**Apply to:** `src/transport/http-callback.ts` (for msgid dedup across WS/HTTP)
```typescript
private seenMsgIds = new Map<string, number>();

private isDuplicate(msgid: string): boolean {
  const now = Date.now();
  if (this.seenMsgIds.has(msgid)) {
    return true;
  }
  this.seenMsgIds.set(msgid, now);
  // cleanup old entries older than 5 minutes
  for (const [id, ts] of this.seenMsgIds) {
    if (now - ts > 5 * 60 * 1000) {
      this.seenMsgIds.delete(id);
    }
  }
  return false;
}
```

### Config Loading
**Source:** `src/config/index.ts` (lines 40-57)
**Apply to:** `src/bot/entry.ts`
```typescript
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | — | — | All new/modified files have strong analogs in the existing codebase. |

## Metadata

**Analog search scope:** `src/` directory and subdirectories
**Files scanned:** 20+
**Pattern extraction date:** 2026-04-15
