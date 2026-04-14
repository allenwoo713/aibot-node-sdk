# Technology Stack

**Analysis Date:** 2026-04-14

## Languages

**Primary:**
- TypeScript 5.3.3 - All source code, SDK and bot service implementation

**Secondary:**
- JavaScript (Node.js) - Build scripts and runtime execution

## Runtime

**Environment:**
- Node.js 22 (Dockerfile uses `node:22-alpine`)
- Target: ES2020 (`tsconfig.json`)

**Package Manager:**
- pnpm (evidenced by `pnpm-lock.yaml` and Dockerfile)
- yarn lockfile also present (`yarn.lock`)
- Lockfile: present (`pnpm-lock.yaml`)

## Frameworks

**Core:**
- `ws` ^8.16.0 - WebSocket client for WeCom long-lived connection
- `axios` ^1.6.7 - HTTP client for file downloads
- `eventemitter3` ^5.0.1 - Typed event emitter for WSClient
- `@anthropic-ai/sdk` ^0.88.0 - Anthropic Claude API integration

**Testing:**
- `vitest` ^4.1.2 - Unit and E2E test runner

**Build/Dev:**
- `rollup` ^4.59.0 - Module bundler for SDK library and bot entry
- `@rollup/plugin-typescript` ^11.1.6 - TypeScript compilation
- `@rollup/plugin-commonjs` ^25.0.7 - CommonJS interop
- `@rollup/plugin-node-resolve` ^15.2.3 - Node module resolution
- `@rollup/plugin-json` ^6.1.0 - JSON imports
- `rollup-plugin-dts` ^6.1.0 - Type declaration bundling
- `ts-node` ^10.9.2 - TypeScript execution for examples and local dev

## Key Dependencies

**Critical:**
- `ws` ^8.16.0 - Core transport for WeCom WebSocket protocol
- `@anthropic-ai/sdk` ^0.88.0 - Powers AI chat responses in the bot orchestrator
- `axios` ^1.6.7 - File download over HTTP
- `eventemitter3` ^5.0.1 - Event-driven architecture for message handling

**Infrastructure:**
- `crypto` (Node.js built-in) - AES-256-CBC decryption, SHA1 signatures, MD5 hashing
- `buffer` (Node.js built-in) - File chunk encoding/decoding
- `fs` / `path` (Node.js built-in) - Conversation persistence and config loading

## Configuration

**Environment:**
- Loaded via `src/config/index.ts` from `process.env`
- `.env.example` documents all variables
- Required: `BOT_ID`, `SECRET`, `ANTHROPIC_API_KEY`

**Build:**
- `tsconfig.json` - TypeScript compiler options, path alias `@/*` → `src/*`
- `rollup.config.mjs` - Three builds: CJS/ESM SDK bundle, dts bundle, bot entry CJS

## Platform Requirements

**Development:**
- Node.js >= 20 (devDependency `@types/node` ^20.11.16)
- pnpm or npm/yarn

**Production:**
- Docker multi-stage build (`Dockerfile`)
- Exposes port 3000
- Entry: `node dist/bot/entry.js`

---

*Stack analysis: 2026-04-14*
