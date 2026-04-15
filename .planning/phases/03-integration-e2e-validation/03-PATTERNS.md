# Phase 3: Integration & E2E Validation - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `__tests__/bot.e2e.test.ts` | test | event-driven | `__tests__/bot.e2e.test.ts` (existing) | exact |
| `__tests__/bot.http.e2e.test.ts` | test | request-response | `src/transport/http-callback.test.ts` | role-match |
| `__tests__/bot.entry.smoke.test.ts` | test | request-response | `src/bot/index.test.ts` | role-match |
| `__tests__/bot.fallback.e2e.test.ts` (implied) | test | event-driven | `src/transport/fallback-transport.test.ts` | exact |

## Pattern Assignments

### `__tests__/bot.e2e.test.ts` (test, event-driven)

**Analog:** `__tests__/bot.e2e.test.ts` (extend existing)

**Imports pattern** (lines 1-43):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state.json');

// Mock the SDK before importing the bot
vi.mock('../src', async () => {
  const actual = await vi.importActual('../src');
  return {
    ...actual,
    WSClient: class MockWSClient extends EventEmitter {
      connect = vi.fn();
      disconnect = vi.fn();
      replyStream = vi.fn().mockResolvedValue(undefined);
    },
    generateReqId: vi.fn().mockReturnValue('stream-e2e'),
  };
});

const chatMock = vi.fn();
vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = chatMock;
  }),
}));

vi.mock('../src/client', () => ({
  WSClient: class MockWSClient extends EventEmitter {
    connect = vi.fn();
    disconnect = vi.fn();
    replyStream = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../src/utils', () => ({
  generateReqId: vi.fn().mockReturnValue('stream-e2e'),
}));

import { BotOrchestrator } from '../src/bot';
import type { WsFrame, TextMessage } from '../src/types';
```

**Mock frame factory** (lines 44-57):
```typescript
function createMockFrame(overrides: Partial<TextMessage> = {}): WsFrame<TextMessage> {
  return {
    headers: { req_id: 'req-e2e' },
    body: {
      msgid: 'm-e2e',
      aibotid: 'bot-e2e',
      chattype: 'single',
      from: { userid: 'user-e2e' },
      msgtype: 'text',
      text: { content: 'E2E hello' },
      ...overrides,
    } as TextMessage,
  };
}
```

**Test setup / teardown pattern** (lines 59-71):
```typescript
describe('Bot E2E', () => {
  beforeEach(() => {
    chatMock.mockReset();
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });
```

**Core E2E pattern** (lines 73-108):
```typescript
  it('end-to-end: single chat message gets a reply', async () => {
    chatMock.mockResolvedValueOnce({ content: 'E2E reply' });

    const bot = new BotOrchestrator({
      botId: 'bot-e2e',
      secret: 'secret',
      anthropicApiKey: 'key',
      anthropicModel: 'claude-test',
      conversationTtlMs: 60000,
      maxConversations: 100,
      maxHistoryMessages: 10,
      rateLimitRequests: 10,
      rateLimitWindowMs: 60000,
      apiTimeoutMs: 5000,
      maxOutputTokens: 100,
      persistencePath: TEST_PERSISTENCE_PATH,
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
    });

    const frame = createMockFrame();
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    expect(chatMock).toHaveBeenCalledTimes(1);
    const wsClient = (bot as any).transport.wsClient;
    expect(wsClient.replyStream).toHaveBeenCalledWith(
      frame,
      'stream-e2e',
      'E2E reply',
      true,
    );

    bot.stop();
  });
```

**Multi-turn extension pattern** (from `src/bot/index.test.ts` lines 88-101):
```typescript
    // First turn
    (bot as any).transport.emit('message.text', frame1);
    await new Promise((r) => setTimeout(r, 50));

    // Second turn — same conversationId (from.userid)
    (bot as any).transport.emit('message.text', frame2);
    await new Promise((r) => setTimeout(r, 50));

    // Assert AI adapter received history on second call
    const secondCall = chatMock.mock.calls[1][0];
    expect(secondCall.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: frame1.body.text.content }),
        expect.objectContaining({ role: 'assistant', content: 'First reply' }),
      ])
    );
```

---

### `__tests__/bot.http.e2e.test.ts` (test, request-response)

**Analog:** `src/transport/http-callback.test.ts` + `__tests__/bot.e2e.test.ts`

**Imports pattern** (from `src/transport/http-callback.test.ts` lines 1-6):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { handleCallback } from './http-callback';
import { WecomCrypto } from '../wecom-crypto';
import type { Transport, TransportEventMap, CallbackPayload } from '../types/transport';
```

**WecomCrypto test setup** (from `src/transport/http-callback.test.ts` lines 16-28):
```typescript
function createValidAesKey(): string {
  // 43-char base64 string padded to 44 with '=' that decodes to 32 bytes
  return 'UB5vEstbVk2v0GFe05JYsbEAAEqkMTuoy4tSbdCc564=';
}

describe('handleCallback', () => {
  let crypto: WecomCrypto;
  let emitter: Transport;
  let logger: ReturnType<typeof createMockLogger>;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    crypto = new WecomCrypto('t', createValidAesKey(), 'r');
    emitter = new EventEmitter<TransportEventMap>() as unknown as Transport;
    logger = createMockLogger();
    emitSpy = vi.spyOn(emitter, 'emit');
  });
```

**Payload encryption pattern** (from `src/transport/http-callback.test.ts` lines 67-77):
```typescript
    const inner = JSON.stringify({ msgid: 'm-success', msgtype: 'text', text: { content: 'hi' } });
    const now = String(Math.floor(Date.now() / 1000));
    const encrypted = crypto.encrypt(inner, now, 'nonce');

    const payload: CallbackPayload = {
      signature: encrypted.signature,
      timestamp: now,
      nonce: 'nonce',
      body: JSON.stringify({ Encrypt: encrypted.encrypt }),
    };
```

**HTTP server test pattern** (inferred from D-02):
```typescript
import http from 'http';

function createCallbackServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  return http.createServer(handler);
}

// In test:
const server = createCallbackServer(async (req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    const response = await handleCallback(
      {
        signature: req.url.searchParams.get('msg_signature')!,
        timestamp: req.url.searchParams.get('timestamp')!,
        nonce: req.url.searchParams.get('nonce')!,
        body,
      },
      crypto,
      transport,
      logger,
    );
    res.writeHead(response.status).end(response.body);
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as any).port;

// POST with axios/fetch
// Cleanup:
server.close();
```

**HttpTransport mock pattern** (from `src/transport/http-transport.test.ts` lines 44-67):
```typescript
    mockApi = {
      getAccessToken: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
      downloadFileRaw: vi.fn(),
    } as unknown as WeComApiClient;

    transport = new HttpTransport({
      botId: 'bot-1',
      secret: 'secret-1',
      corpId: 'corp-1',
      agentId: 'agent-1',
      logger: createMockLogger(),
    });

    // Replace internal apiClient with mock
    (transport as any).apiClient = mockApi;
    (transport as any).tokenCache = new TokenCache(mockApi, 'corp-1', 'secret-1', createMockLogger());
```

---

### `__tests__/bot.entry.smoke.test.ts` (test, request-response)

**Analog:** `src/bot/index.test.ts` + `src/bot/entry.ts`

**Dynamic import smoke pattern** (inferred from D-03):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state-smoke.json');

vi.mock('../src/config', () => ({
  loadConfig: vi.fn().mockReturnValue({
    botId: 'bot-smoke',
    secret: 'secret',
    anthropicApiKey: 'key',
    anthropicModel: 'claude-test',
    conversationTtlMs: 60000,
    maxConversations: 100,
    maxHistoryMessages: 10,
    rateLimitRequests: 10,
    rateLimitWindowMs: 60000,
    apiTimeoutMs: 5000,
    maxOutputTokens: 100,
    persistencePath: TEST_PERSISTENCE_PATH,
    internalSystemPrompt: 'You are helpful.',
    externalSystemPrompt: 'You are a guest helper.',
    corpId: 'corp-smoke',
    agentId: 'agent-smoke',
  }),
}));

vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = vi.fn();
  }),
}));

vi.mock('../src/transport', async () => {
  const { EventEmitter } = await vi.importActual('eventemitter3');
  return {
    WsTransport: class MockWsTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
    HttpTransport: class MockHttpTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
    FallbackTransport: class MockFallbackTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
  };
});
```

**Entry smoke assertion pattern**:
```typescript
  it('loads config and instantiates without throwing', async () => {
    const { bot } = await import('../src/bot/entry');
    expect(bot).toBeDefined();
    expect((bot as any).transport).toBeDefined();
    bot.stop();
  });
```

---

### `__tests__/bot.fallback.e2e.test.ts` (implied, test, event-driven)

**Analog:** `src/transport/fallback-transport.test.ts`

**Mock transport factory** (from `src/transport/fallback-transport.test.ts` lines 14-23):
```typescript
function createMockTransport(): Transport {
  const emitter = new EventEmitter<TransportEventMap>() as unknown as Transport;
  return Object.assign(emitter, {
    connect: vi.fn(),
    stop: vi.fn(),
    sendText: vi.fn().mockResolvedValue(undefined),
    sendStream: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn(),
  });
}
```

**Fallback routing assertion pattern** (from `src/transport/fallback-transport.test.ts` lines 52-65):
```typescript
    vi.mocked(primary.isConnected).mockReturnValue(true);
    vi.mocked(fallback.isConnected).mockReturnValue(true);

    const transport = new FallbackTransport(primary as any, fallback as any);
    (primary as any).emit('connected');
    (primary as any).emit('disconnected', 'network error');

    const frame = createMockFrame();
    await transport.sendText(frame, 'hello');

    expect(fallback.sendText).toHaveBeenCalledTimes(1);
    expect(primary.sendText).toHaveBeenCalledTimes(0);
```

**Deduplication assertion pattern** (from `src/transport/fallback-transport.test.ts` lines 67-76):
```typescript
    const transport = new FallbackTransport(primary as any, fallback as any);
    const emitSpy = vi.spyOn(transport, 'emit');

    const frame = createMockFrame('m-dup');
    (primary as any).emit('message.text', frame);
    (fallback as any).emit('message.text', frame);

    expect(emitSpy).toHaveBeenCalledTimes(1);
```

## Shared Patterns

### E2E Test Mocking Strategy
**Source:** `__tests__/bot.e2e.test.ts`
**Apply to:** All E2E test files
```typescript
// Mock Anthropic adapter before any bot import
const chatMock = vi.fn();
vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = chatMock;
  }),
}));

// Mock transport internals if needed
vi.mock('../src/transport', async () => {
  const { EventEmitter } = await vi.importActual('eventemitter3');
  return {
    WsTransport: class MockWsTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
    // ... HttpTransport, FallbackTransport mocks
  };
});
```

### Persistence Path Isolation
**Source:** `__tests__/bot.e2e.test.ts` + `src/bot/index.test.ts`
**Apply to:** All test files using `ConversationStore`
```typescript
// E2E uses .test-bot-state.json
// Unit uses .test-bot-state-unit.json
// Smoke should use .test-bot-state-smoke.json
const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state-smoke.json');

beforeEach(() => {
  if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
    fs.unlinkSync(TEST_PERSISTENCE_PATH);
  }
});
afterEach(() => {
  if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
    fs.unlinkSync(TEST_PERSISTENCE_PATH);
  }
});
```

### Message Injection Pattern
**Source:** `__tests__/bot.e2e.test.ts` + `src/bot/index.test.ts`
**Apply to:** All BotOrchestrator E2E tests
```typescript
// Inject messages by emitting on the internal transport
(bot as any).transport.emit('message.text', frame);
await new Promise((r) => setTimeout(r, 50));
```

### WecomCrypto Payload Generation
**Source:** `src/transport/http-callback.test.ts`
**Apply to:** `__tests__/bot.http.e2e.test.ts`
```typescript
function createValidAesKey(): string {
  return 'UB5vEstbVk2v0GFe05JYsbEAAEqkMTuoy4tSbdCc564=';
}

const crypto = new WecomCrypto('token', createValidAesKey(), 'receiveId');
const inner = JSON.stringify({ msgid: 'm1', msgtype: 'text', text: { content: 'hi' } });
const now = String(Math.floor(Date.now() / 1000));
const encrypted = crypto.encrypt(inner, now, 'nonce');

const payload = {
  signature: encrypted.signature,
  timestamp: now,
  nonce: 'nonce',
  body: JSON.stringify({ Encrypt: encrypted.encrypt }),
};
```

### Logger Mock
**Source:** `src/transport/http-callback.test.ts` + `src/transport/http-transport.test.ts`
**Apply to:** Any test needing a mock logger
```typescript
function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
```

### HttpTransport Internal Mocking
**Source:** `src/transport/http-transport.test.ts`
**Apply to:** HTTP E2E tests that need to intercept WeCom API calls
```typescript
(transport as any).apiClient = mockApi;
(transport as any).tokenCache = new TokenCache(mockApi, 'corp-1', 'secret-1', createMockLogger());
```

## No Analog Found

None — all expected files have strong analogs in the codebase.

## Metadata

**Analog search scope:** `__tests__/`, `src/bot/`, `src/transport/`, `src/wecom-crypto/`, `src/config/`
**Files scanned:** 11
**Pattern extraction date:** 2026-04-15
