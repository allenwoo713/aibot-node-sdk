# gstack

For all web browsing, use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.

## Available gstack Skills

- `/office-hours` - Get help from the office hours skill
- `/plan-ceo-review` - Plan a CEO review
- `/plan-eng-review` - Plan an engineering review
- `/plan-design-review` - Plan a design review
- `/design-consultation` - Get design consultation
- `/review` - Review code or documents
- `/ship` - Ship a feature or release
- `/land-and-deploy` - Land and deploy changes
- `/canary` - Canary deployment
- `/benchmark` - Run benchmarks
- `/browse` - Browse the web (preferred over Chrome MCP tools)
- `/qa` - Quality assurance
- `/qa-only` - QA only mode
- `/design-review` - Design review
- `/setup-browser-cookies` - Setup browser cookies
- `/setup-deploy` - Setup deployment
- `/retro` - Retrospective
- `/investigate` - Investigation
- `/document-release` - Document a release
- `/codex` - Codex integration
- `/cso` - Chief Security Officer consultation
- `/autoplan` - Auto planning
- `/careful` - Careful mode
- `/freeze` - Freeze deployment
- `/guard` - Guard mode
- `/unfreeze` - Unfreeze deployment
- `/gstack-upgrade` - Upgrade gstack

<!-- GSD:project-start source:PROJECT.md -->
## Project

**aibot-node-sdk**

A TypeScript SDK and bot service for WeCom (WeChat Work) integration, with an AI orchestrator layer powered by Anthropic Claude. The SDK handles WebSocket transport, message framing, file download/decryption, and AI-driven conversation replies with memory.

**Core Value:** Developers can integrate a production-ready AI bot into WeCom with minimal setup, while the SDK provides reliable real-time messaging and extensible architecture.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.3.3 - All source code, SDK and bot service implementation
- JavaScript (Node.js) - Build scripts and runtime execution
## Runtime
- Node.js 22 (Dockerfile uses `node:22-alpine`)
- Target: ES2020 (`tsconfig.json`)
- pnpm (evidenced by `pnpm-lock.yaml` and Dockerfile)
- yarn lockfile also present (`yarn.lock`)
- Lockfile: present (`pnpm-lock.yaml`)
## Frameworks
- `ws` ^8.16.0 - WebSocket client for WeCom long-lived connection
- `axios` ^1.6.7 - HTTP client for file downloads
- `eventemitter3` ^5.0.1 - Typed event emitter for WSClient
- `@anthropic-ai/sdk` ^0.88.0 - Anthropic Claude API integration
- `vitest` ^4.1.2 - Unit and E2E test runner
- `rollup` ^4.59.0 - Module bundler for SDK library and bot entry
- `@rollup/plugin-typescript` ^11.1.6 - TypeScript compilation
- `@rollup/plugin-commonjs` ^25.0.7 - CommonJS interop
- `@rollup/plugin-node-resolve` ^15.2.3 - Node module resolution
- `@rollup/plugin-json` ^6.1.0 - JSON imports
- `rollup-plugin-dts` ^6.1.0 - Type declaration bundling
- `ts-node` ^10.9.2 - TypeScript execution for examples and local dev
## Key Dependencies
- `ws` ^8.16.0 - Core transport for WeCom WebSocket protocol
- `@anthropic-ai/sdk` ^0.88.0 - Powers AI chat responses in the bot orchestrator
- `axios` ^1.6.7 - File download over HTTP
- `eventemitter3` ^5.0.1 - Event-driven architecture for message handling
- `crypto` (Node.js built-in) - AES-256-CBC decryption, SHA1 signatures, MD5 hashing
- `buffer` (Node.js built-in) - File chunk encoding/decoding
- `fs` / `path` (Node.js built-in) - Conversation persistence and config loading
## Configuration
- Loaded via `src/config/index.ts` from `process.env`
- `.env.example` documents all variables
- Required: `BOT_ID`, `SECRET`, `ANTHROPIC_API_KEY`
- `tsconfig.json` - TypeScript compiler options, path alias `@/*` → `src/*`
- `rollup.config.mjs` - Three builds: CJS/ESM SDK bundle, dts bundle, bot entry CJS
## Platform Requirements
- Node.js >= 20 (devDependency `@types/node` ^20.11.16)
- pnpm or npm/yarn
- Docker multi-stage build (`Dockerfile`)
- Exposes port 3000
- Entry: `node dist/bot/entry.js`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

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
- Sync I/O errors in `ConversationStore` are swallowed to avoid crashing on corrupt state files
## Comments
- Mixed Chinese and English comments; Chinese dominates in WebSocket-layer documentation
- JSDoc used sparingly for public methods and complex logic (e.g., `WsConnectionManager`)
## Module Organization
- `src/index.ts` acts as the public API barrel, re-exporting types and classes
- Co-location of tests: unit tests live next to source (`chunker.test.ts`, `memory.test.ts`, `bot/index.test.ts`)
- E2E tests live in `__tests__/` at project root
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Typed EventEmitter pattern for all inbound message/event dispatch
- Separation between transport (WebSocket), protocol (frame types), and business logic (bot orchestrator)
- Queue-based serial reply handling per `req_id` to guarantee ordered delivery
- Retry with exponential backoff for reconnections and auth failures
- Pluggable AI backend adapter (currently Anthropic-only)
## Layers
- Purpose: Maintain WebSocket connection, authenticate, send/receive frames, queue replies
- Location: `src/client.ts`, `src/ws.ts`, `src/api.ts`
- Contains: `WSClient`, `WsConnectionManager`, `WeComApiClient`
- Depends on: `ws`, `axios`, `eventemitter3`, Node.js `crypto`
- Used by: Bot orchestrator, direct SDK consumers, examples
- Purpose: Parse WebSocket frames and emit typed events
- Location: `src/message-handler.ts`
- Contains: `MessageHandler`
- Depends on: `WSClient` (as emitter), type definitions
- Used by: `WSClient`
- Purpose: Strongly typed contracts for all frames, messages, events, and template cards
- Location: `src/types/`
- Contains: `api.ts`, `message.ts`, `event.ts`, `config.ts`, `common.ts`, `index.ts`
- Depends on: `ws` types
- Used by: All other layers
- Purpose: AES-256-CBC decrypt for downloaded files, SHA1 signature verification
- Location: `src/wecom-crypto/`, `src/crypto.ts`
- Contains: `WecomCrypto`, `decryptFile`, `decodeEncodingAESKey`, `pkcs7Pad`, `pkcs7Unpad`
- Depends on: Node.js `crypto`
- Used by: `WSClient` (file download decryption), exported for consumers
- Purpose: High-level AI bot that connects WeCom messages to Anthropic responses with memory and rate limiting
- Location: `src/bot/`
- Contains: `BotOrchestrator`, `entry.ts`
- Depends on: `WSClient`, `ConversationStore`, `AnthropicApiAdapter`, `loadConfig`
- Used by: Docker runtime (`dist/bot/entry.js`)
- Purpose: In-memory conversation history with TTL, LRU, sliding window, and JSON persistence
- Location: `src/memory.ts`
- Contains: `ConversationStore`
- Depends on: Node.js `fs`
- Used by: `BotOrchestrator`
- Purpose: Abstract AI backend; currently implements Anthropic Messages API
- Location: `src/ai/`
- Contains: `AiBackend` interface, `AnthropicApiAdapter`
- Depends on: `@anthropic-ai/sdk`
- Used by: `BotOrchestrator`
- Purpose: Load and validate environment-based bot configuration
- Location: `src/config/index.ts`
- Contains: `BotConfig`, `loadConfig`
- Depends on: Node.js `fs`, `path`, `process.env`
- Used by: `BotOrchestrator`, `entry.ts`
## Data Flow
## Key Abstractions
- Purpose: Universal envelope for all WebSocket communication
- Defined in: `src/types/api.ts`
- Pattern: `{ cmd?, headers: { req_id }, body?: T, errcode?, errmsg? }`
- Purpose: Decouple logging from console for testability and customization
- Defined in: `src/types/common.ts`
- Pattern: `debug`, `info`, `warn`, `error` methods
- Purpose: Allow swapping AI providers without changing bot logic
- Defined in: `src/ai/adapter.ts`
- Pattern: `chat(options: ChatOptions): Promise<ChatResult>`
## Entry Points
- Location: `src/index.ts`
- Triggers: Imported as a library (`@wecom/aibot-node-sdk`)
- Responsibilities: Exports `WSClient`, `WeComApiClient`, `WsConnectionManager`, `MessageHandler`, crypto utilities, types
- Location: `src/bot/entry.ts`
- Triggers: `npm start`, `node dist/bot/entry.js`, Docker CMD
- Responsibilities: Load config, instantiate `BotOrchestrator`, start connection, handle SIGINT/SIGTERM
## Error Handling
- Custom error classes: `WSAuthFailureError`, `WSReconnectExhaustedError` (`src/types/common.ts`)
- Auth failures trigger separate retry counter from connection drops (`src/ws.ts`)
- AI adapter catches API errors and returns a fallback message with `error: true` (`src/ai/api-adapter.ts`)
- File download errors are logged and re-thrown to caller (`src/client.ts`)
- Best-effort persistence: `ConversationStore` silently ignores corrupt state files
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
