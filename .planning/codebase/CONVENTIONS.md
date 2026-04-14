# Code Conventions

## Language & Style

- **TypeScript 5.3+** with strict mode enabled (`strict: true`, `noImplicitAny: true`)
- Target `ES2020`, module `ESNext`, resolution `node`
- Path alias `@/*` maps to `src/*` via `tsconfig.json`
- No ESLint or Prettier configs checked in; formatting relies on developer/editor discipline

## Naming Conventions

- **Classes**: PascalCase (`WSClient`, `BotOrchestrator`, `ConversationStore`)
- **Interfaces/Types**: PascalCase, often prefixed by domain (`WSClientOptions`, `BotConfig`)
- **Functions/Methods**: camelCase (`chunkMessage`, `generateReqId`, `isRateLimited`)
- **Constants/Enum members**: PascalCase or camelCase (`WsCmd`, `DEFAULT_WS_URL`)
- **Private members**: prefixed with `private` keyword; no underscore prefix convention
- **Files**: kebab-case for modules (`message-handler.ts`, `api-adapter.ts`)

## Code Patterns

- **Event-driven architecture**: Heavy use of `eventemitter3` for internal pub/sub (`WSClient`, `WsConnectionManager`)
- **Adapter pattern**: `AnthropicApiAdapter` implements `AiBackend` interface to isolate vendor SDK
- **Configuration via environment**: `src/config/index.ts` uses `getEnv()` / `getEnvInt()` helpers with defaults
- **Lazy initialization**: `ConversationStore` loads persisted state in constructor
- **Best-effort error suppression**: Several `catch` blocks silently ignore errors (e.g., `load()`, `save()` in `ConversationStore`)

## Error Handling

- Custom error types in `src/types/common.ts`: `WSAuthFailureError`, `WSReconnectExhaustedError`
- Most async paths swallow errors and return fallback strings rather than throwing:
  - `AnthropicApiAdapter.chat()` returns `"服务暂时繁忙，请稍后再试。"` on any failure
  - `BotOrchestrator` logs to `console.error` inside `try/catch` but does not propagate
- Sync I/O errors in `ConversationStore` are swallowed to avoid crashing on corrupt state files

## Comments

- Mixed Chinese and English comments; Chinese dominates in WebSocket-layer documentation
- JSDoc used sparingly for public methods and complex logic (e.g., `WsConnectionManager`)

## Module Organization

- `src/index.ts` acts as the public API barrel, re-exporting types and classes
- Co-location of tests: unit tests live next to source (`chunker.test.ts`, `memory.test.ts`, `bot/index.test.ts`)
- E2E tests live in `__tests__/` at project root
