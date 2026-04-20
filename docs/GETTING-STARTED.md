<!-- generated-by: gsd-doc-writer -->

# Getting Started

This guide will get you from zero to a running WeCom AI bot in a few minutes.

## Prerequisites

- **Node.js** `>= 20` (the project targets ES2020; Docker image uses `node:22-alpine`)
- **pnpm** `>= 8` (recommended; npm and yarn also work)
- A **WeCom bot** created in the admin console with a `BOT_ID` and `SECRET`
- An **Anthropic API key** (or a compatible provider key)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/WecomTeam/aibot-node-sdk.git
   cd aibot-node-sdk
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

   If you prefer npm or yarn:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Copy the example environment file and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least these three variables:

   | Variable            | Source                                                    |
   | ------------------- | --------------------------------------------------------- |
   | `BOT_ID`            | WeCom admin console -> Smart Bot -> Bot ID                |
   | `SECRET`            | WeCom admin console -> Smart Bot -> Secret                |
   | `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys               |

## First Run

### Run the built-in AI bot

```bash
pnpm start
```

This launches the full bot orchestrator (`src/bot/entry.ts`) which connects to WeCom via WebSocket and replies to messages using Anthropic Claude.

### Run the basic SDK example

```bash
pnpm run example
```

This runs `examples/basic.ts`, demonstrating raw WebSocket connection, message handling, and file download/decryption without the AI layer.

### Build the project

```bash
pnpm run build
```

Outputs:

- `dist/index.cjs.js` – CommonJS bundle
- `dist/index.esm.js` – ESM bundle
- `dist/index.d.ts`  – bundled type declarations
- `dist/bot/entry.js` – bot runtime entry point

## Common Setup Issues

### `better-sqlite3` native compilation fails during install

`better-sqlite3` requires native build tools. On Alpine Linux (Docker) or minimal environments, ensure `python3`, `make`, and `g++` are installed before running `pnpm install`.

```bash
# Alpine / Docker
apk add --no-cache python3 make g++
```

### Missing environment variables cause immediate crash

The bot validates required env vars on startup. If `BOT_ID`, `SECRET`, or `ANTHROPIC_API_KEY` are missing, you will see an error like:

```
Error: Missing required environment variable: BOT_ID
```

Make sure you created `.env` from `.env.example` and filled in all required fields.

### Port 3000 is already in use

The Docker image exposes port `3000`. If another service occupies it, map a different host port:

```bash
docker run -p 3001:3000 ...
```

### WeCom WebSocket URL differs for private deployments

Private deployments use a custom WebSocket endpoint. Check your WeCom admin console for the correct URL and set it in `.env`:

```bash
WS_URL=wss://your-custom-ws-endpoint.example.com
```

## Next Steps

- **Architecture** – See [ARCHITECTURE.md](ARCHITECTURE.md) for system design and component overview.
- **Configuration** – See [CONFIGURATION.md](CONFIGURATION.md) for the full list of environment variables and their defaults.
- **Development** – Run `pnpm dev` to watch and rebuild on file changes, or `pnpm test` to run the test suite.
