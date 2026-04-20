<!-- generated-by: gsd-doc-writer -->

# Contributing to @wecom/aibot-node-sdk

Thank you for your interest in contributing to this project.

## Development Setup

See [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) for prerequisites and first-run instructions, and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local development setup and build commands.

## Coding Standards

- TypeScript strict mode is enabled (`strict: true`, `noImplicitAny: true`)
- Target: `ES2020`, module: `ESNext`, resolution: `node`
- Path alias `@/*` maps to `src/*`
- No checked-in ESLint, Prettier, or Biome configs; formatting relies on developer and editor discipline
- No `.editorconfig` is checked in; formatting relies on editor discipline

## PR Guidelines

1. Ensure tests pass locally: `pnpm test`
2. Ensure the project builds: `pnpm run build`
3. Open pull requests against the `main` branch
4. The CI pipeline (`.github/workflows/ci.yml`) validates every PR by running tests and the build on Node.js 22

## Issue Reporting

Report bugs or request features via [GitHub Issues](https://github.com/WecomTeam/aibot-node-sdk/issues).

When reporting a bug, please include:

- Steps to reproduce
- Expected behavior vs actual behavior
- Node.js version and operating system
- Relevant logs or error messages
