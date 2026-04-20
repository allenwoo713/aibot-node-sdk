<!-- generated-by: gsd-doc-writer -->

# Testing

This document covers how to run and write tests for `@wecom/aibot-node-sdk`.

## Test Framework and Setup

The project uses **Vitest** `^4.1.2` as its test runner. Vitest is configured with its zero-config defaults; there is no custom `vitest.config.ts` in the repository.

- **Framework:** Vitest `^4.1.2`
- **Assertion library:** Built-in Vitest `expect`
- **Mocking:** Built-in Vitest `vi` (replaces `jest` mocks)
- **Setup required:** `pnpm install` (or `npm install` / `yarn install`)

No global test setup file is required. Each test file handles its own environment preparation and cleanup.

## Running Tests

### Full suite

```bash
pnpm test
```

This runs `vitest run` and executes all unit and E2E tests once.

### Watch mode

Vitest supports watch mode out of the box:

```bash
npx vitest
```

### Run a specific file or pattern

```bash
npx vitest run src/bot/index.test.ts
npx vitest run __tests__/bot.e2e.test.ts
```

### Run tests by directory

```bash
npx vitest run src/          # unit tests only
npx vitest run __tests__/    # E2E tests only
```

## Writing New Tests

### File naming convention

- **Unit tests:** Co-located next to the source file they test, named `{module}.test.ts`  
  Examples: `src/chunker.test.ts`, `src/memory.test.ts`, `src/bot/index.test.ts`
- **E2E / integration tests:** Placed in `__tests__/` at project root, named `*.e2e.test.ts` or `*.smoke.test.ts`  
  Examples: `__tests__/bot.e2e.test.ts`, `__tests__/bot.entry.smoke.test.ts`

### Shared helpers and patterns

- Use `vi.fn()` for mocks and `vi.mock()` for module-level mocks.
- Use `vi.spyOn()` to spy on existing methods.
- Mock external dependencies (Anthropic SDK, `fs`, `eventemitter3`) at the module level with `vi.mock()`.
- Clean up temporary test files in `beforeEach` / `afterEach` hooks. Common cleanup targets are `.test-bot-state*.json`, `.test-bot-state*.db`, and `.migrated-*` files.
- Use `await new Promise((r) => setTimeout(r, 50))` to allow async handlers to settle in event-driven tests.

### Example: minimal unit test

```typescript
import { describe, it, expect } from 'vitest';
import { chunkMessage } from './chunker';

describe('chunkMessage', () => {
  it('returns empty array for empty string', () => {
    expect(chunkMessage('', 10)).toEqual([]);
  });
});
```

## Coverage Requirements

No coverage threshold is configured in the repository. To generate a coverage report, run:

```bash
npx vitest run --coverage
```

You can add a `vitest.config.ts` with `coverage.thresholds` if you want to enforce minimum coverage in CI.

## CI Integration

Tests run automatically in GitHub Actions via `.github/workflows/ci.yml`.

| Workflow | Trigger | Commands |
|----------|---------|----------|
| CI | Push to `main`, pull requests to `main` | `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run build` |

The CI job uses Node.js 22 on `ubuntu-latest`.

## Test Inventory

### Unit tests (co-located with source)

| File | What it tests |
|------|---------------|
| `src/chunker.test.ts` | UTF-8 aware message chunking (ASCII, CJK, emoji) |
| `src/memory.test.ts` | `ConversationStore`: append, get, TTL eviction, LRU, sliding window, persistence, async serialization, corruption recovery |
| `src/ai/api-adapter.test.ts` | `AnthropicApiAdapter`: success path, retries (5xx, 429, timeout), fail-fast (401/400/403/404/422), token truncation, validation fallbacks, configurable fallback messages |
| `src/bot/index.test.ts` | `BotOrchestrator`: single reply, AI error fallback, rate limiting, external contact prompt, group message mention filtering, message chunking, graceful stop |
| `src/config/index.test.ts` | `loadConfig`: required vars, defaults, overrides, validation errors, AI retry/fallback defaults |
| `src/transport/http-transport.test.ts` | `HttpTransport` and `TokenCache`: token caching, token refresh on 42001, stream buffering |
| `src/transport/fallback-transport.test.ts` | `FallbackTransport`: primary/fallback routing, deduplication, event forwarding |
| `src/transport/http-callback.test.ts` | `handleCallback`: signature validation, timestamp freshness, decryption, duplicate msgid dropping, XML envelope support |
| `src/persistence/backends.test.ts` | Shared behavior of `JsonFileBackend` and `SqliteBackend`: load/save round-trip, overwrite, multiple conversations, empty records |
| `src/persistence/sqlite-backend.test.ts` | `SqliteBackend`: WAL mode, JSON-to-SQLite migration, corrupt JSON handling, missing JSON handling, idempotent close |

### E2E / smoke tests (`__tests__/`)

| File | What it tests |
|------|---------------|
| `__tests__/bot.e2e.test.ts` | End-to-end bot flow: single message reply, API failure fallback, multi-turn conversation history |
| `__tests__/bot.fallback.e2e.test.ts` | Fallback transport switching from WebSocket to HTTP after disconnect |
| `__tests__/bot.http.e2e.test.ts` | Full HTTP callback server: encrypted payload decryption, bot reply via HTTP transport |
| `__tests__/bot.entry.smoke.test.ts` | Smoke test for `src/bot/entry.ts`: loads config and instantiates the full stack without throwing |
| `__tests__/wecom-crypto.test.ts` | WeCom crypto utilities (signature, encryption/decryption) |
