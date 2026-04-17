# Architecture Patterns: AI Validation & Persistent Storage Integration

**Domain:** TypeScript Node.js SDK — WeCom AI bot with adapter-pattern architecture
**Researched:** 2026-04-17
**Confidence:** HIGH

## Recommended Architecture

### System Overview (v1.1 Target)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BotOrchestrator                                    │
│  ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐ │
│  │  RateLimiter    │    │  ConversationStore  │    │  ValidatingAdapter  │ │
│  │   (existing)    │◄──►│   (pluggable impl)  │◄──►│   (new wrapper)     │ │
│  └─────────────────┘    └─────────────────────┘    └─────────────────────┘ │
│           │                        │                          │              │
│           ▼                        ▼                          ▼              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Transport (WS / HTTP / Fallback)                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI Backend Layer                                │
│  ┌─────────────────────────────┐        ┌─────────────────────────────────┐ │
│  │   ValidatingAiBackend       │        │      AnthropicApiAdapter        │ │
│  │   (decorator / wrapper)     │───────►│      (existing adapter)         │ │
│  │                             │        │                                 │ │
│  │  • Response schema checks   │        │  (future: OpenAI, Gemini, etc.) │ │
│  │  • Error classification     │        └─────────────────────────────────┘ │
│  │  • Retry policies           │                                             │
│  │  • Token / cost guards      │                                             │
│  └─────────────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Persistence Backend Layer                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │  JsonFileStore   │  │  SqliteStore     │  │  MongoStore (future)       │ │
│  │  (existing)      │  │  (new)           │  │  (future)                  │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │
│         ▲                    ▲                      ▲                       │
│         └────────────────────┴──────────────────────┘                       │
│                              │                                              │
│                    ConversationStore (interface preserved)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `BotOrchestrator` | Routes messages, applies rate limits, delegates to store and AI | `Transport`, `ConversationStore`, `AiBackend` |
| `ValidatingAiBackend` | Decorates any `AiBackend` with validation, retries, token guards | `BotOrchestrator` (consumer), `AiBackend` (delegate) |
| `AnthropicApiAdapter` | Vendor-specific API calls (unchanged) | `ValidatingAiBackend` |
| `ConversationStore` | Public API facade: `get`, `append`, `clear`, `buildMessages` | `BotOrchestrator`, persistence backends |
| `JsonFileStore` | JSON file persistence (existing logic extracted) | `ConversationStore` |
| `SqliteStore` | SQLite+WAL persistence with async I/O | `ConversationStore` |

---

## Patterns to Follow

### Pattern 1: Decorator Wrapper for AI Validation

**What:** Implement `AiBackend` in a `ValidatingAiBackend` class that wraps another `AiBackend`. The orchestrator talks to the wrapper; the wrapper delegates to the real adapter after/before running guards.

**When to use:** When cross-cutting concerns (validation, retries, cost guards) must apply uniformly regardless of which vendor adapter is underneath.

**Trade-offs:**
- Pro: Zero changes to `AnthropicApiAdapter` or `BotOrchestrator` call sites.
- Pro: Easy to unit-test validation logic in isolation.
- Con: Slightly deeper call stack; avoid over-nesting.

**Example:**
```typescript
// src/ai/validating-adapter.ts
import type { AiBackend, ChatOptions, ChatResult } from './adapter';

export interface ValidationConfig {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostPerCallUsd?: number;
  allowedContentRegex?: RegExp;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
    retryableErrors: string[];
  };
}

export class ValidatingAiBackend implements AiBackend {
  constructor(
    private delegate: AiBackend,
    private config: ValidationConfig,
    private logger?: Logger,
  ) {}

  async chat(options: ChatOptions): Promise<ChatResult> {
    this.validateRequest(options);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.retryPolicy.maxAttempts; attempt++) {
      try {
        const result = await this.delegate.chat(options);
        return this.validateResponse(result);
      } catch (err) {
        lastError = err;
        if (!this.isRetryable(err) || attempt === this.config.retryPolicy.maxAttempts) {
          break;
        }
        await delay(this.config.retryPolicy.backoffMs * (attempt + 1));
      }
    }

    this.logger?.error('AI call failed after retries', lastError);
    return { content: '服务暂时繁忙，请稍后再试。', error: true };
  }

  private validateRequest(options: ChatOptions): void {
    // Token estimation, cost guards, schema pre-checks
  }

  private validateResponse(result: ChatResult): ChatResult {
    // Schema checks, content filtering, usage validation
    return result;
  }

  private isRetryable(err: unknown): boolean {
    // Classify errors (timeout, 5xx, 429, etc.)
    return true;
  }
}
```

### Pattern 2: Strategy/Adapter Pattern for Persistence Backends

**What:** Extract the file I/O logic from `ConversationStore` into a `PersistenceBackend` interface. `ConversationStore` becomes a memory-backed facade that delegates load/save/eviction policy to a swappable backend.

**When to use:** When the same in-memory behavior (TTL, LRU, sliding window) must survive across different storage engines.

**Trade-offs:**
- Pro: Existing consumers of `ConversationStore` see no breaking changes.
- Pro: Backends can be tested independently.
- Con: Slightly more abstraction; keep interface minimal to avoid leakage.

**Example:**
```typescript
// src/memory/backend.ts
export interface PersistenceBackend {
  load(): Promise<Record<string, ConversationRecord>>;
  save(data: Record<string, ConversationRecord>): Promise<void>;
}

// src/memory/json-file-backend.ts
export class JsonFileBackend implements PersistenceBackend {
  constructor(private path: string, private logger?: Logger) {}
  async load() { /* existing load() logic */ }
  async save(data) { /* existing doSave() logic */ }
}

// src/memory/sqlite-backend.ts
export class SqliteBackend implements PersistenceBackend {
  constructor(private dbPath: string, private logger?: Logger) {}
  async load() { /* SELECT all active records */ }
  async save(data) { /* UPSERT in WAL mode */ }
}
```

### Pattern 3: Facade Preservation for Backward Compatibility

**What:** Keep `ConversationStore`'s public method signatures identical. Only its constructor gains an optional `backend` parameter; if omitted, default to `JsonFileBackend` using the existing `persistencePath` config.

**When to use:** When the class is consumed by external SDK users and by internal orchestrator code.

**Trade-offs:**
- Pro: No migration needed for existing deployments.
- Pro: Tests using `ConversationStore` continue to pass.
- Con: Constructor signature grows slightly; use an options object to keep it clean.

**Example:**
```typescript
// src/memory.ts (backward-compatible constructor)
export interface ConversationStoreOptions {
  conversationTtlMs: number;
  maxConversations: number;
  maxHistoryMessages: number;
  persistencePath: string;
  logger?: Logger;
  backend?: PersistenceBackend;
}

export class ConversationStore {
  constructor(options: ConversationStoreOptions) {
    this.config = options;
    this.logger = options.logger;
    this.backend = options.backend ?? new JsonFileBackend(options.persistencePath, options.logger);
    // ... rest unchanged
  }
}
```

---

## Data Flow

### AI Request Flow (with Validation Layer)

```
[WeCom message]
      │
      ▼
[BotOrchestrator.handleTextMessage]
      │
      ▼
[Rate limit check] ──► (reject if exceeded)
      │
      ▼
[ConversationStore.append] ──► [PersistenceBackend.save]
      │
      ▼
[ConversationStore.buildMessages]
      │
      ▼
[ValidatingAiBackend.chat]
      ├──► [validateRequest] (tokens, cost guards)
      │
      ├──► [retry loop]
      │         │
      │         ▼
      │    [AnthropicApiAdapter.chat]
      │         │
      │         ▼
      │    [Anthropic SDK]
      │         │
      │         ▼
      ├──► [validateResponse] (schema, usage)
      │
      ▼
[Return ChatResult to orchestrator]
      │
      ▼
[ConversationStore.append assistant reply]
      │
      ▼
[Transport.sendStream / sendText]
```

### Persistence Save Flow (pluggable backend)

```
[BotOrchestrator] calls store.append()
      │
      ▼
[ConversationStore] updates in-memory Map
      │
      ├──► [evictIfExpired] ──► [evictLru]
      │
      ▼
[PersistenceBackend.save]
      │
      ├──► [JsonFileBackend] ──► fs.writeFile + atomic rename
      │
      ├──► [SqliteBackend] ──► sqlite INSERT/UPDATE in WAL mode
      │
      └──► [MongoStore] ──► collection replaceOne (future)
```

### Key Data Flows

1. **Validation Decorator Flow:** `BotOrchestrator` keeps a reference to `AiBackend`. At construction time, inject a `ValidatingAiBackend` that wraps the real adapter. The orchestrator does not know whether it is talking to a raw adapter or a decorated one.

2. **Pluggable Persistence Flow:** `ConversationStore` always maintains an in-memory `Map` for fast reads. Writes are pushed asynchronously to the configured `PersistenceBackend`. On `init()`, the backend `load()` hydrates the Map. On `save()`, the entire Map is serialized by the backend.

---

## Scalability Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 bot, 1K convos | `JsonFileBackend` is fine. `ValidatingAiBackend` adds negligible overhead. |
| 1 bot, 10K+ convos, frequent restarts | Switch to `SqliteBackend` (WAL) to avoid full-file rewrite churn and corruption risk. |
| Multi-instance / horizontal scale | `ConversationStore` must be replaced or backed by a shared DB (Mongo/Postgres). The `PersistenceBackend` interface makes this swap possible without touching `BotOrchestrator`. |

### Scaling Priorities

1. **First bottleneck:** JSON file rewrite latency at high save frequency. Mitigation: `SqliteBackend` with WAL mode and batched writes.
2. **Second bottleneck:** Single-process memory cap for `Map`-backed store. Mitigation: Cap `maxConversations` aggressively, or move to a DB-backed query model where `get()` reads from SQLite instead of memory.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Leaking Backend Details into the Public API

**What people do:** Add SQLite-specific methods like `runMigration()` or `vacuum()` directly on `ConversationStore`.

**Why it's wrong:** Breaks the abstraction. Existing consumers and tests become coupled to SQLite.

**Do this instead:** Expose backend-specific operations through the `PersistenceBackend` interface or a dedicated backend manager. `ConversationStore` stays agnostic.

### Anti-Pattern 2: Validating Inside the Vendor Adapter

**What people do:** Modify `AnthropicApiAdapter.chat()` to include retry loops, schema checks, and cost guards.

**Why it's wrong:** Every future adapter (OpenAI, Gemini, local LLM) would need to duplicate validation logic. `BotOrchestrator` would also need to know which adapter is in use.

**Do this instead:** Keep vendor adapters thin and focused on HTTP/API mapping. Wrap them in `ValidatingAiBackend` so validation is adapter-agnostic.

### Anti-Pattern 3: Synchronous Persistence in the Hot Path

**What people do:** Call `fs.writeFileSync` or `db.exec('COMMIT')` directly inside `append()` without a queue.

**Why it's wrong:** Blocks the event loop, causing backpressure on the WebSocket message stream and violating the v1.0 async-I/O win.

**Do this instead:** Keep the `saveQueue` pattern. `ConversationStore.save()` chains onto a promise queue; the backend's `save()` is always async.

---

## Integration Points

### New Components vs Modified Components

| New / Modified | File | Change |
|----------------|------|--------|
| **New** | `src/ai/validating-adapter.ts` | `ValidatingAiBackend` implements `AiBackend`, wraps delegate |
| **New** | `src/ai/validation-config.ts` | Types and defaults for validation/retry policies |
| **New** | `src/memory/backend.ts` | `PersistenceBackend` interface |
| **New** | `src/memory/json-file-backend.ts` | Extracted existing JSON persistence logic |
| **New** | `src/memory/sqlite-backend.ts` | SQLite+WAL implementation |
| **Modified** | `src/memory.ts` | Add `backend` option, delegate load/save to backend |
| **Modified** | `src/bot/index.ts` | Wire `ValidatingAiBackend` around `AnthropicApiAdapter` |
| **Modified** | `src/config/index.ts` | Add optional validation and SQLite config keys |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `BotOrchestrator` ↔ `AiBackend` | Direct method call via interface | Orchestrator stays agnostic to validation or vendor specifics |
| `BotOrchestrator` ↔ `ConversationStore` | Direct method call | Public API unchanged; backend is an internal detail |
| `ConversationStore` ↔ `PersistenceBackend` | Direct method call | Minimal interface (`load`, `save`) prevents leakage |
| `ValidatingAiBackend` ↔ `AnthropicApiAdapter` | Direct method call | Decorator pattern; adapter has no knowledge of wrapper |

---

## Suggested Build Order

1. **Extract `PersistenceBackend` interface and `JsonFileBackend`**
   - Keeps tests green.
   - Proves backward compatibility.

2. **Refactor `ConversationStore` to use `PersistenceBackend`**
   - Default to `JsonFileBackend`.
   - Run existing test suite.

3. **Implement `SqliteBackend`**
   - Add `better-sqlite3` or `sqlite3` dependency.
   - Write backend-specific unit tests.

4. **Implement `ValidatingAiBackend` shell**
   - Implement `AiBackend`, pass through to delegate.
   - Wire into `BotOrchestrator` behind a feature flag or config.

5. **Add validation rules (schema, retries, token guards)**
   - Unit test each guard independently.
   - Integrate with retry loop.

6. **E2E tests covering both backends and validation paths**
   - Confirm `BotOrchestrator` behavior is identical across JSON and SQLite.

---

## Sources

- Existing codebase: `src/ai/adapter.ts`, `src/ai/api-adapter.ts`, `src/memory.ts`, `src/bot/index.ts`, `src/config/index.ts`
- Adapter / Decorator patterns: Gang of Four Design Patterns
- SQLite WAL mode best practices: SQLite official documentation (https://sqlite.org/wal.html)
