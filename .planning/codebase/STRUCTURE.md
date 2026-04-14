# Codebase Structure

**Analysis Date:** 2026-04-14

## Directory Layout

```
[project-root]/
├── src/                    # Source code (TypeScript)
│   ├── ai/                 # AI backend adapters
│   ├── bot/                # Bot orchestrator and service entry
│   ├── config/             # Environment configuration loader
│   ├── types/              # TypeScript type definitions
│   └── wecom-crypto/       # WeCom AES-256-CBC crypto utilities
├── __tests__/              # Test files (vitest)
├── examples/               # Usage examples
├── dist/                   # Compiled output (Rollup)
├── scripts/                # Build/release scripts
├── .github/workflows/      # CI workflows
├── .planning/codebase/     # Codebase documentation
├── package.json            # Package manifest
├── tsconfig.json           # TypeScript config
├── rollup.config.mjs       # Rollup build config
├── Dockerfile              # Container build
└── .env.example            # Environment variable template
```

## Directory Purposes

**`src/ai/`:**
- Purpose: AI provider abstraction and implementations
- Contains: Adapter interface, Anthropic implementation, tests
- Key files: `src/ai/adapter.ts`, `src/ai/api-adapter.ts`, `src/ai/api-adapter.test.ts`

**`src/bot/`:**
- Purpose: High-level bot service that wires SDK to AI and memory
- Contains: Orchestrator class, service entry point, tests
- Key files: `src/bot/index.ts`, `src/bot/entry.ts`, `src/bot/index.test.ts`

**`src/config/`:**
- Purpose: Environment-based configuration loading and validation
- Contains: Config types, loader, tests
- Key files: `src/config/index.ts`, `src/config/index.test.ts`

**`src/types/`:**
- Purpose: All TypeScript interfaces, enums, and event maps
- Contains: API frames, messages, events, config types, common utilities
- Key files: `src/types/api.ts`, `src/types/message.ts`, `src/types/event.ts`, `src/types/index.ts`

**`src/wecom-crypto/`:**
- Purpose: Standalone WeCom cryptographic primitives
- Contains: AES decrypt/encrypt, PKCS7 padding, SHA1 signature
- Key files: `src/wecom-crypto/index.ts`

**`__tests__/`:**
- Purpose: E2E and integration tests
- Contains: Bot E2E tests, crypto tests
- Key files: `__tests__/bot.e2e.test.ts`, `__tests__/wecom-crypto.test.ts`

**`examples/`:**
- Purpose: Demonstrate SDK usage
- Contains: Basic usage example with all event handlers
- Key files: `examples/basic.ts`

## Key File Locations

**Entry Points:**
- `src/index.ts`: SDK library exports
- `src/bot/entry.ts`: Bot service runtime entry

**Configuration:**
- `tsconfig.json`: TypeScript compiler (ES2020, path alias `@/*`)
- `rollup.config.mjs`: Three Rollup targets (CJS+ESM SDK, dts bundle, bot CJS)
- `src/config/index.ts`: Runtime env loader

**Core Logic:**
- `src/client.ts`: `WSClient` — public API surface
- `src/ws.ts`: `WsConnectionManager` — WebSocket lifecycle, auth, heartbeat, reply queues
- `src/message-handler.ts`: `MessageHandler` — frame parsing and event emission
- `src/api.ts`: `WeComApiClient` — HTTP file downloads
- `src/memory.ts`: `ConversationStore` — in-memory history with persistence
- `src/chunker.ts`: `chunkMessage` — UTF-8 safe message chunking

**Testing:**
- `src/bot/index.test.ts`: Bot orchestrator unit tests
- `src/ai/api-adapter.test.ts`: Anthropic adapter unit tests
- `src/config/index.test.ts`: Config loader unit tests
- `src/memory.test.ts`: Conversation store unit tests
- `src/chunker.test.ts`: Chunker unit tests
- `__tests__/bot.e2e.test.ts`: End-to-end bot test
- `__tests__/wecom-crypto.test.ts`: Crypto test

## Naming Conventions

**Files:**
- Lowercase with hyphens: `message-handler.ts`, `api-adapter.ts`
- Test files: co-located as `*.test.ts` or in `__tests__/*.test.ts`

**Directories:**
- Lowercase, hyphenated when needed: `wecom-crypto/`

**Classes:**
- PascalCase: `WSClient`, `BotOrchestrator`, `ConversationStore`

**Types/Interfaces:**
- PascalCase with descriptive names: `WsFrame<T>`, `TextMessage`, `WSClientEventMap`

## Where to Add New Code

**New Feature (SDK surface):**
- Primary code: `src/client.ts` for public methods, `src/types/api.ts` for new frame types
- Tests: co-located `*.test.ts` or `__tests__/`

**New Component/Module:**
- Implementation: add directory under `src/` (e.g., `src/new-feature/`) or file directly in `src/`
- Export from `src/index.ts`

**New AI Backend:**
- Implementation: `src/ai/{provider}-adapter.ts`
- Interface: `src/ai/adapter.ts`
- Tests: `src/ai/{provider}-adapter.test.ts`

**Utilities:**
- Shared helpers: `src/utils.ts`

## Special Directories

**`dist/`:**
- Purpose: Compiled JavaScript and type declarations
- Generated: Yes (by Rollup + TypeScript)
- Committed: Yes (present in repo and included in `files: ["dist"]` for npm publish)

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes
- Committed: No (`.gitignore`)

---

*Structure analysis: 2026-04-14*
