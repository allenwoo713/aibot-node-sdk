# Phase 5: Persistent Conversation Storage - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 12
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/persistence/index.ts` | model/interface | transform | `src/ai/adapter.ts` | role-match |
| `src/persistence/json-file-backend.ts` | service | file-I/O | `src/memory.ts` (existing `doSave`/`load`) | exact |
| `src/persistence/sqlite-backend.ts` | service | CRUD | `src/memory.ts` (persistence logic) | role-match |
| `src/memory.ts` | model | CRUD | existing file (self-modify) | exact |
| `src/memory.test.ts` | test | request-response | existing file (self-modify) | exact |
| `src/bot/index.ts` | controller | request-response | existing file (self-modify) | exact |
| `src/bot/index.test.ts` | test | request-response | existing file (self-modify) | exact |
| `src/bot/entry.ts` | controller | request-response | existing file (self-modify) | exact |
| `src/config/index.ts` | config | transform | existing file (self-modify) | exact |
| `package.json` | config | transform | existing file (self-modify) | exact |
| `rollup.config.mjs` | config | transform | existing file (self-modify) | exact |
| `Dockerfile` | config | transform | existing file (self-modify) | exact |

## Pattern Assignments

### `src/persistence/index.ts` (model/interface, transform)

**Analog:** `src/ai/adapter.ts`

**Imports pattern** (lines 1-3):
```typescript
import type { AiBackend, ChatOptions, ChatResult } from './adapter';
import type { BotConfig } from '../config';
```

**Core interface pattern** (lines 5-9):
```typescript
export interface AiBackend {
  chat(options: ChatOptions): Promise<ChatResult>;
}
```

**Pattern to copy:** Define a minimal interface with method signatures, use `type` imports for cross-module types, export from an `index.ts` barrel file.

---

### `src/persistence/json-file-backend.ts` (service, file-I/O)

**Analog:** `src/memory.ts` (lines 52-87)

**Imports pattern** (lines 1-4):
```typescript
import fs from 'fs/promises';
import path from 'path';
import type { BotConfig } from './config';
import type { Logger } from './types';
```

**Core load pattern** (lines 52-67):
```typescript
private async load(): Promise<void> {
  try {
    const exists = await fs.access(this.config.persistencePath).then(() => true).catch(() => false);
    if (!exists) return;
    const raw = await fs.readFile(this.config.persistencePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, ConversationRecord>;
    const now = Date.now();
    for (const [id, record] of Object.entries(parsed)) {
      if (now - record.lastAccessedAt < this.config.conversationTtlMs) {
        this.store.set(id, record);
      }
    }
  } catch (err) {
    this.logger?.warn('Failed to load conversation state, starting fresh.', err);
  }
}
```

**Core save pattern** (lines 77-87):
```typescript
private async doSave(): Promise<void> {
  const obj = Object.fromEntries(this.store.entries());
  const data = JSON.stringify(obj);
  if (process.platform !== 'win32') {
    const tmpPath = `${this.config.persistencePath}.tmp`;
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, this.config.persistencePath);
  } else {
    await fs.writeFile(this.config.persistencePath, data, 'utf-8');
  }
}
```

**Error handling pattern** (lines 64-66, 71-73):
```typescript
catch (err) {
  this.logger?.warn('Failed to load conversation state, starting fresh.', err);
}
```

---

### `src/persistence/sqlite-backend.ts` (service, CRUD)

**Analog:** `src/memory.ts` (persistence logic) + `src/ai/api-adapter.ts` (constructor config picking)

**Constructor config picking pattern** (from `src/ai/api-adapter.ts` lines 22-23):
```typescript
constructor(config: Pick<BotConfig, 'anthropicApiKey' | 'anthropicBaseUrl' | ...>) {
```

**Best-effort error suppression pattern** (from `src/memory.ts` lines 64-66):
```typescript
catch (err) {
  this.logger?.warn('Failed to load conversation state, starting fresh.', err);
}
```

**Note:** No existing SQLite code in codebase. Use RESEARCH.md code examples for `better-sqlite3` API patterns.

---

### `src/memory.ts` (model, CRUD) — MODIFIED

**Analog:** existing file (self)

**Constructor pattern** (lines 32-35):
```typescript
constructor(config: Pick<BotConfig, 'conversationTtlMs' | 'maxConversations' | 'maxHistoryMessages' | 'persistencePath'> & { logger?: Logger }) {
  this.config = config;
  this.logger = config.logger;
}
```

**Lazy init pattern** (lines 38-49):
```typescript
private init(): Promise<void> {
  if (this.initialized) {
    return Promise.resolve();
  }
  if (this.initPromise) {
    return this.initPromise;
  }
  this.initPromise = this.load().then(() => {
    this.initialized = true;
  });
  return this.initPromise;
}
```

**Save queue pattern** (lines 70-75):
```typescript
save(): Promise<void> {
  this.saveQueue = this.saveQueue.then(() => this.doSave()).catch((err) => {
    this.logger?.warn('Failed to save conversation state.', err);
  });
  return this.saveQueue;
}
```

**Synchronous get pattern** (lines 90-96):
```typescript
get(conversationId: string): HistoryMessage[] {
  this.evictIfExpired(conversationId);
  const record = this.store.get(conversationId);
  if (!record) return [];
  record.lastAccessedAt = Date.now();
  return record.messages;
}
```

---

### `src/bot/index.ts` (controller, request-response) — MODIFIED

**Analog:** existing file (self)

**Constructor pattern** (lines 25-37):
```typescript
constructor(config: BotConfig, transport?: Transport) {
  this.config = config;
  this.logger = config.logger ?? new DefaultLogger('BotOrchestrator');
  this.transport = transport ?? new WsTransport({...});
  this.store = new ConversationStore({ ...config, logger: this.logger });
  this.adapter = new AnthropicApiAdapter(config);
  this.setupEventHandlers();
}
```

**Current sync stop pattern** (lines 43-45):
```typescript
stop(): void {
  this.transport.stop();
}
```

**Async handler pattern** (lines 47-59):
```typescript
private setupEventHandlers(): void {
  this.transport.on('message.text', async (frame: WsFrame<TextMessage>) => {
    try {
      await this.handleTextMessage(frame);
    } catch (err: any) {
      console.error('Bot handler error:', err?.message || String(err));
    }
  });
}
```

---

### `src/bot/entry.ts` (controller, request-response) — MODIFIED

**Analog:** existing file (self)

**Current sync shutdown pattern** (lines 26-33):
```typescript
function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down bot...`);
  bot.stop();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
```

**Pattern to change:** Make `gracefulShutdown` async, `await bot.stop()`, then `process.exit(0)`.

---

### `src/config/index.ts` (config, transform) — MODIFIED

**Analog:** existing file (self)

**getEnv pattern** (lines 64-71):
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

**Config object pattern** (lines 83-118):
```typescript
export function loadConfig(): BotConfig {
  const config: BotConfig = {
    botId: getEnv('BOT_ID'),
    // ...
    persistencePath: getEnv('PERSISTENCE_PATH', path.resolve(process.cwd(), '.bot-state.json')),
    // ...
  };

  // Ensure persistence directory exists
  const dir = path.dirname(config.persistencePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return config;
}
```

**Pattern to add:** New `persistenceBackend` field loaded via `getEnv('PERSISTENCE_BACKEND', 'json')`.

---

### `package.json` (config, transform) — MODIFIED

**Analog:** existing file (self)

**Dependencies pattern** (lines 39-44):
```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.88.0",
  "axios": "^1.6.7",
  "eventemitter3": "^5.0.1",
  "ws": "^8.16.0"
}
```

**Pattern to add:** Add `"better-sqlite3": "^12.9.0"` to `dependencies`, `"@types/better-sqlite3": "^7.6.13"` to `devDependencies`.

---

### `rollup.config.mjs` (config, transform) — MODIFIED

**Analog:** existing file (self)

**External array pattern** (line 7):
```typescript
const external = ['ws', 'axios', 'eventemitter3', 'crypto', 'buffer', '@anthropic-ai/sdk', 'fs', 'path'];
```

**Pattern to add:** Add `'better-sqlite3'` to the `external` array to prevent bundling the native addon.

---

### `Dockerfile` (config, transform) — MODIFIED

**Analog:** existing file (self)

**Builder stage pattern** (lines 1-13):
```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build
```

**Pattern to add:** Add `python3 make g++` (or `build-base` + `python3`) to builder stage for `better-sqlite3` native compilation on Alpine.

---

### `src/memory.test.ts` (test, request-response) — MODIFIED

**Analog:** existing file (self)

**Test setup pattern** (lines 1-48):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { ConversationStore } from './memory';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state.json');

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
```

**Cleanup pattern** (lines 29-48):
```typescript
beforeEach(() => {
  try {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.rmSync(TEST_PERSISTENCE_PATH, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
});

afterEach(() => {
  try {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.rmSync(TEST_PERSISTENCE_PATH, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
  vi.restoreAllMocks();
});
```

**Async test pattern** (lines 55-64):
```typescript
it('appends and retrieves messages', async () => {
  const store = createStore();
  await store.append('c1', { role: 'user', content: 'hello' });
  await store.append('c1', { role: 'assistant', content: 'hi' });

  const history = store.get('c1');
  expect(history).toHaveLength(2);
  expect(history[0].role).toBe('user');
  expect(history[1].role).toBe('assistant');
});
```

**Spy pattern** (lines 144-157):
```typescript
const readFileSpy = vi.spyOn(fsPromises, 'readFile');
// ...
expect(readFileSpy).not.toHaveBeenCalled();
expect(readFileSpy).toHaveBeenCalledTimes(1);
expect(readFileSpy).toHaveBeenCalledWith(TEST_PERSISTENCE_PATH, 'utf-8');
```

---

### `src/bot/index.test.ts` (test, request-response) — MODIFIED

**Analog:** existing file (self)

**Mock transport pattern** (lines 19-30):
```typescript
vi.mock('../transport', async () => {
  const { EventEmitter } = await vi.importActual('eventemitter3');
  return {
    WsTransport: class MockWsTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
  };
});
```

**Mock adapter pattern** (lines 33-38):
```typescript
const chatMock = vi.fn();
vi.mock('../ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = chatMock;
  }),
}));
```

**Async test with event emission** (lines 97-110):
```typescript
it('replies to single chat text messages', async () => {
  chatMock.mockResolvedValueOnce({ content: 'Hi there' });

  const bot = createBot();
  const frame = createMockFrame();
  (bot as any).transport.emit('message.text', frame);

  // Wait for async handler
  await new Promise((r) => setTimeout(r, 50));

  expect(chatMock).toHaveBeenCalledTimes(1);
  const transport = (bot as any).transport;
  expect(transport.sendStream).toHaveBeenCalledWith(frame, 'stream-123', 'Hi there', true);
});
```

---

### `__tests__/bot.entry.smoke.test.ts` (test, request-response) — MODIFIED

**Analog:** existing file (self)

**Mock config pattern** (lines 7-26):
```typescript
vi.mock('../src/config', () => ({
  loadConfig: vi.fn().mockReturnValue({
    botId: 'bot-smoke',
    secret: 'secret',
    // ...
    persistencePath: TEST_PERSISTENCE_PATH,
    // ...
  }),
}));
```

**Smoke test pattern** (lines 72-78):
```typescript
it('loads config and instantiates full stack without throwing', async () => {
  const { bot } = await import('../src/bot/entry');
  expect(bot).toBeDefined();
  expect((bot as any).transport).toBeDefined();
  bot.stop();
});
```

**Pattern to change:** `bot.stop()` may need `await` if it becomes async.

---

## Shared Patterns

### Best-Effort Error Suppression
**Source:** `src/memory.ts` (lines 64-66, 71-73)
**Apply to:** All backend implementations (`JsonFileBackend`, `SqliteBackend`), `ConversationStore.close()`
```typescript
catch (err) {
  this.logger?.warn('Failed to load conversation state, starting fresh.', err);
}
```

### Logger Optional Chaining
**Source:** `src/memory.ts` (line 65)
**Apply to:** All new service files
```typescript
this.logger?.warn('...', err);
```

### Pick<BotConfig, ...> Constructor Pattern
**Source:** `src/ai/api-adapter.ts` (line 22)
**Apply to:** `SqliteBackend`, `JsonFileBackend` if they need config
```typescript
constructor(config: Pick<BotConfig, 'persistencePath' | 'conversationTtlMs' | ...>) {
```

### Environment Variable Loading
**Source:** `src/config/index.ts` (lines 64-71, 83-118)
**Apply to:** `persistenceBackend` config field
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

### Path Alias Imports
**Source:** Throughout codebase
**Apply to:** All new files
```typescript
import type { BotConfig } from '../config';
import type { Logger } from '../types';
```

### Test Cleanup (Sync fs)
**Source:** `src/memory.test.ts` (lines 29-48)
**Apply to:** All new test files
```typescript
beforeEach(() => {
  try {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.rmSync(TEST_PERSISTENCE_PATH, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
});
```

### Rollup External Declaration
**Source:** `rollup.config.mjs` (line 7)
**Apply to:** `better-sqlite3` addition
```typescript
const external = ['ws', 'axios', 'eventemitter3', 'crypto', 'buffer', '@anthropic-ai/sdk', 'fs', 'path'];
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/persistence/sqlite-backend.ts` | service | CRUD | No SQLite code exists in codebase; use RESEARCH.md `better-sqlite3` examples |
| `src/persistence/backends.test.ts` | test | request-response | No parameterized multi-backend test pattern exists yet; use RESEARCH.md Pattern 4 |
| `src/persistence/sqlite-backend.test.ts` | test | request-response | No migration-specific test pattern exists; invent from scratch |

## Metadata

**Analog search scope:** `src/`, `__tests__/`
**Files scanned:** 15
**Pattern extraction date:** 2026-04-19
