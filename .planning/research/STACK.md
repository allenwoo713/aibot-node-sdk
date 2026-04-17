# Stack Research

**Domain:** Node.js SDK — AI API validation + persistent conversation storage
**Researched:** 2026-04-17
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `better-sqlite3` | ^12.6.2 | SQLite database for conversation persistence | Fastest Node.js SQLite binding; full WAL support; sync API simplifies serialization (wrap in worker thread or queue for async). Prebuilt binaries available for Node.js 22 LTS. |
| `sqlite3` (@tryghost/node-sqlite3) | ^5.1.7 | Alternative async SQLite driver | Native async API, Node-API prebuilt binaries, zero blocking. Good choice if you want to avoid wrapping sync calls. Bundles json1 extension. |
| `mongodb` | ^6.15.0 | MongoDB native driver for multi-node deployments | Connection pooling, async-first, standard for Node.js 22. Only needed if choosing MongoDB backend. |
| `zod` | ^3.24.2 | Runtime schema validation for AI responses | TypeScript-first, zero-config type inference, tiny bundle size. Ideal for validating Anthropic message shapes. |
| Node.js `fs/promises` | 22.x (built-in) | Existing JSON persistence path | Zero deps, battle-tested. Keep as default fallback for backward compatibility. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `worker_threads` | Node.js built-in | Offload `better-sqlite3` sync calls if needed | Use if you pick `better-sqlite3` but want to avoid blocking the event loop on large writes. For typical conversation sizes (<1MB), a simple async queue wrapping sync calls is usually sufficient. |
| `node-sqlite3-wasm` | — | Pure-JS/WASM SQLite (no native compile) | Use if Docker multi-arch builds or restricted environments make native modules painful. Slower than `better-sqlite3` but easier deployment. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` | Test all persistence backends | Already installed. Use `vi.fn()` and temp directories for backend isolation. |
| `typescript` 5.3+ | Type-safe backend interfaces | Ensure `PersistenceBackend` interface is strict so future stores are easy to add. |

## Installation

```bash
# For SQLite backend (recommended for v1.1)
npm install better-sqlite3

# OR async SQLite alternative
npm install sqlite3

# For MongoDB backend (optional, multi-node scenarios)
npm install mongodb

# For AI response schema validation
npm install zod
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `better-sqlite3` | `sqlite3` (async) | When you need a 100% native async API and want to avoid any sync DB calls. Slightly lower throughput but simpler code flow. |
| `better-sqlite3` | `node-sqlite3-wasm` | When native module builds are blocked (e.g., strict CI, exotic architectures). Accepts ~2-3x lower throughput. |
| `zod` | Pure TypeScript guards | When bundle size is critical and schemas are trivial. Zod is small enough that the DX tradeoff usually wins. |
| SQLite+WAL | MongoDB | When the SDK must run across multiple stateless replicas that share conversation state. SQLite WAL requires shared filesystem. |
| JSON file persistence | SQLite | JSON is fine for v1.0 "best-effort" durability. SQLite is the right upgrade for ACID, concurrent safety, and larger histories. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `sqlite3` (old `mapbox/node-sqlite3`) | Unmaintained; build issues on modern Node.js | `@tryghost/node-sqlite3` or `better-sqlite3` |
| `mongoose` for SDK persistence | Heavy ODM, overkill for simple conversation CRUD | Native `mongodb` driver or SQLite |
| `lowdb` / `json-server` | File-based JSON stores don't solve the concurrency/ACID problems that motivated this milestone | SQLite |
| `typeorm` / `prisma` | ORM migration overhead and bundle bloat for a simple message store | Raw SQL via `better-sqlite3` or `sqlite3` |
| Synchronous `fs.writeFileSync` without queue | Blocks event loop; was the root cause of v1.0 async refactor | Async queue + `fs/promises` OR SQLite |

## Stack Patterns by Variant

**If choosing `better-sqlite3`:**
- Use `db.pragma('journal_mode = WAL');` immediately after opening.
- Set `db.pragma('synchronous = NORMAL');` for good durability/performance balance.
- Wrap writes in an async queue (Promise chain) so callers see an async API even though the DB call is sync.
- Keep an in-memory LRU cache so `get()` remains sync and fast.

**If choosing `sqlite3` (async):**
- Use `db.serialize()` for schema creation, then normal `db.run()` / `db.all()` for ops.
- WAL mode is enabled the same way (`PRAGMA journal_mode = WAL`).
- No need for an extra async queue — the driver handles serialization.
- Prebuilt binaries cover Node.js 22, Docker (linuxmusl), and Windows.

**If choosing MongoDB:**
- Store one document per conversation (`{ conversationId, messages[], updatedAt }`).
- Use `findOneAndUpdate` with `$set` / `$push` for append operations.
- Connection string defaults to `mongodb://localhost` for local dev; allow override via env.

**If validating Anthropic responses:**
- Use `zod` to assert the expected `content` array shape.
- Keep validation lightweight — don't block the event loop with deep recursive schemas.
- Classify errors inside the validation wrapper (`ValidatingAiBackend`), not the vendor adapter.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `better-sqlite3@12.6.2` | Node.js 18, 20, 22 | Prebuilt binaries available. Falls back to node-gyp if architecture is unsupported. |
| `sqlite3@5.1.7` | Node.js 10+ (Node-API v3/v6) | Prebuilt binaries for darwin/linux/linuxmusl/win32. json1 extension bundled. |
| `mongodb@6.15.0` | Node.js 18+ | Connection pooling, async-first. Tested on Node.js 22. |
| `zod@3.24.2` | TypeScript 5.0+ | No runtime dependencies. Works with strict mode. |

## Sources

- Context7 `/wiselibs/better-sqlite3/v12.6.2` — installation, WAL mode, worker threads
- Context7 `/websites/npmjs_package_sqlite3` — async API, prebuilt binaries, json1 extension
- Context7 `/mongodb/docs` — Node.js driver connection, pooling
- Context7 `/colinhacks/zod/v3.24.2` — schema validation, TypeScript-first design
- Verified `pnpm-lock.yaml` and `package.json` for existing project stack

---
*Stack research for: aibot-node-sdk v1.1 AI Validation & Persistent Storage*
*Researched: 2026-04-17*
