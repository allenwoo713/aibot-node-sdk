<!-- generated-by: gsd-doc-writer -->

# Development Guide

This document covers how to set up the project for local development, build the SDK and bot service, and follow the project's coding conventions.

## Local Setup

1. Fork and clone the repository:

```bash
git clone https://github.com/WecomTeam/aibot-node-sdk.git
cd aibot-node-sdk
```

2. Install dependencies with pnpm:

```bash
pnpm install
```

3. Copy the example environment file and configure required variables:

```bash
cp .env.example .env
```

Edit `.env` and set at least `BOT_ID`, `SECRET`, and `ANTHROPIC_API_KEY`. See [CONFIGURATION.md](CONFIGURATION.md) for details on all variables.

4. Build the project:

```bash
pnpm run build
```

5. Run the bot in development mode:

```bash
pnpm start
```

Or run the live-reload build watcher:

```bash
pnpm run dev
```

## Build Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Compile TypeScript and bundle the SDK (CJS + ESM) and bot entry point |
| `pnpm run dev` | Run Rollup in watch mode for development |
| `pnpm run clean` | Remove the `dist/` directory |
| `pnpm run prebuild` | Runs `clean` automatically before `build` |
| `pnpm run example` | Run the basic usage example (`examples/basic.ts`) with ts-node |
| `pnpm start` | Run the bot service entry point (`src/bot/entry.ts`) with ts-node |
| `pnpm test` | Run the full test suite with Vitest |
| `pnpm run release` | Publish the package (defined in `package.json`) |
| `pnpm run release:dry` | Dry-run the release script |

## Code Style

This project does not include checked-in ESLint, Prettier, or Biome configurations. Formatting relies on developer and editor discipline.

- TypeScript strict mode is enabled (`strict: true`, `noImplicitAny: true`)
- Target: `ES2020`, module: `ESNext`, resolution: `node`
- Path alias `@/*` maps to `src/*`
- Please ensure your editor respects the `.editorconfig` conventions if one is present

## Branch Conventions

No branch naming convention is documented in this repository. The default branch is `main`.

## PR Process

Pull requests are validated by the CI workflow (`.github/workflows/ci.yml`). Before opening a PR:

1. Ensure tests pass locally: `pnpm test`
2. Ensure the project builds: `pnpm run build`
3. Push your branch and open a pull request against `main`

The CI pipeline runs on every push and pull request to `main` and performs the following steps:

- Checks out the code
- Sets up Node.js 22
- Installs pnpm and dependencies with `pnpm install --frozen-lockfile`
- Runs `pnpm test`
- Runs `pnpm run build`
