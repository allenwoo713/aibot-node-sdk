# Stack Research

**Domain:** Node.js SDK — async persistence + WeCom HTTP fallback
**Researched:** 2026-04-14
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js `fs/promises` | 22.14.0 (built-in) | Async file I/O for `ConversationStore` | Eliminates event-loop blocking without adding dependencies. Verified on Windows and POSIX. Supports `writeFile({ flush: true })`, `AbortSignal`, and atomic rename patterns. |
| Node.js `stream/promises` | 22.14.0 (built-in) | Safe stream piping for large JSON / HTTP bodies | `pipeline()` handles cleanup and backpressure automatically. Required for streaming file downloads and large persistence payloads. |
| Node.js `crypto` | 22.14.0 (built-in) | SHA1 signatures + AES-256-CBC for WeCom HTTP callbacks | Existing `WecomCrypto` class already uses this. No extra deps needed for callback verification or decryption. |
| Node.js `http` / `https` | 22.14.0 (built-in) | HTTP callback server for WeCom push fallback | Minimal surface area, zero dependencies. Sufficient for handling GET (URL verification) and POST (message/event push) callbacks. |
| `axios` | 1.15.0 (installed) | HTTP client for WeCom API fallback (send messages, download files) | Already in the project. Supports `responseType: 'stream'`, `FormData`, multipart uploads, and request/response interceptors. |
| `ws` | 8.20.0 (installed) | Primary WebSocket transport | Keep as primary transport. HTTP fallback wraps around it, not replaces it. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `FormData` + `Blob` | Node.js 22 built-in | Multipart form uploads for WeCom media messages via HTTP | Use when sending image/file/voice/video over HTTP fallback. `axios` auto-detects and sets boundary. |
| Native `AbortController` | Node.js 22 built-in | Timeout/cancellation for HTTP requests and fs operations | Use for HTTP fallback request timeouts and for cancelling long-running `fs/promises` reads if needed. |
| `events/promises` (`once`) | Node.js 22 built-in | Awaiting one-off events (e.g., server listen, stream finish) | Cleaner than manual Promise wrappers when setting up HTTP servers or streams. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` | Unit + integration tests for async store and HTTP fallback | Already installed at 4.1.4. Use `vi.fn()` to mock `fs/promises` and HTTP servers. |
| `typescript` 5.9.3 | Type safety for async API changes | Ensure `ConversationStore` methods return `Promise<T>` and callers `await`. |

## Installation

No new runtime dependencies are required. The milestone can be implemented entirely with built-in Node.js 22 APIs and existing project dependencies.

```bash
# Existing deps already cover HTTP fallback
# axios ^1.6.7 (resolved to 1.15.0)
# ws ^8.16.0 (resolved to 8.20.0)

# No additional packages needed for async I/O
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `fs/promises` + in-memory queue | `p-queue` or `bull` | Only if you need cross-process job persistence or rate-limiting across multiple workers. For a single-process SDK, built-in Promise chaining is simpler and sufficient. |
| Built-in `http` server | `express` or `fastify` | Only if you need middleware ecosystems, routing libraries, or request logging. For a single callback endpoint, built-in `http` avoids dependency bloat. |
| `axios` for HTTP fallback | Native `fetch` | Native `fetch` is viable in Node.js 22, but `axios` is already installed and provides better timeout control, interceptors, and stream handling. Stick with `axios` for consistency. |
| JSON file persistence | `sqlite3` or `level` | Only if you need concurrent multi-process access or complex queries. For a single-process in-memory store with best-effort persistence, JSON is the right tradeoff. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `fs.readFileSync` / `fs.writeFileSync` in `ConversationStore` | Blocks the event loop on every message append. At 500KB payloads this adds 50+ ms of latency to all concurrent requests. | `fs/promises.readFile` and `fs/promises.writeFile` with an async save queue. |
| `deasync` or `child_process.execSync` to "make async code sync" | Defeats the purpose, adds native module complexity, and breaks in Docker/alpine builds. | Refactor callers to `await` the async store methods. |
| `express` for the HTTP callback server | Adds ~60 transitive dependencies for a single POST/GET endpoint. | Built-in `http.createServer` with manual routing (~30 lines). |
| `form-data` npm package | Native `FormData` and `Blob` are stable in Node.js 22. The npm package is redundant and larger. | Native `FormData` + `Blob` passed directly to `axios`. |
| `xml2js` or `fast-xml-parser` for WeCom callbacks | Modern WeCom HTTP callback payloads can be handled as JSON where configured. If XML is absolutely required, parse the minimal subset manually rather than adding a parser dependency. | JSON payloads for callbacks; manual string extraction as fallback. |
| Symlinks for atomic writes | Requires elevated privileges on Windows (EPERM by default). | Use temp-file + `rename` on POSIX; direct serialized `writeFile` on Windows (since the store uses an async queue, concurrent writes are already eliminated). |

## Stack Patterns by Variant

**If running on Windows:**
- Use a serialized async save queue (no concurrent writes).
- Write directly to the target file with `fs.promises.writeFile` instead of `rename` over an open file.
- Readers are served from memory, so file-read/write races are avoided.

**If running on POSIX (Linux/macOS):**
- Use temp-file + `fs.promises.rename` for atomic persistence.
- Optionally call `fh.sync()` before closing the temp file for durability.

**If WeCom callback messages arrive as XML:**
- Prefer configuring the WeCom backend to send JSON payloads.
- If XML is unavoidable, extract `Encrypt`, `ToUserName`, and `AgentID` with simple regex/string operations rather than pulling in a full XML parser.

**If sending media over HTTP fallback:**
- Use `FormData` with `Blob` for the media payload.
- Let `axios` auto-detect and set the `multipart/form-data` boundary.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `axios@1.15.0` | Node.js 18+ | Fully compatible with Node.js 22. Supports `FormData`, `Blob`, and `AbortSignal`. |
| `ws@8.20.0` | Node.js 18+ | No compatibility issues with Node.js 22. Keep as primary transport. |
| `@types/node@20.19.39` | TypeScript 5.3+ | Covers Node.js 22 APIs well enough for `fs/promises`, `stream/promises`, and native `fetch`/`FormData`. |

## Sources

- Node.js 22.14.0 runtime verification (`process.version`)
- `pnpm-lock.yaml` — `axios@1.15.0`, `ws@8.20.0`, `eventemitter3@5.0.4`, `@anthropic-ai/sdk@0.88.0`, `vitest@4.1.4`, `typescript@5.9.3`, `@types/node@20.19.39`
- Direct API verification via Node.js REPL for `fs/promises`, `stream/promises`, `crypto`, `http`, native `fetch`/`FormData`/`Blob`, `AbortController`
- Windows-specific behavior validation (atomic rename EPERM when target is open, `appendFile` concurrency safety, `fs.promises.writeFile` direct-write behavior)

---
*Stack research for: aibot-node-sdk async persistence + WeCom HTTP fallback*
*Researched: 2026-04-14*
