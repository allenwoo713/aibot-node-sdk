# Testing

## Framework

- **Vitest** (`vitest@^4.1.2`) — runs via `pnpm test` (`vitest run`)
- No separate UI or browser test runner configured

## Test Structure

| Location | Purpose |
|----------|---------|
| `src/chunker.test.ts` | Unit tests for UTF-8 message chunking |
| `src/memory.test.ts` | Unit tests for `ConversationStore` (TTL, LRU, persistence) |
| `src/bot/index.test.ts` | Unit tests for `BotOrchestrator` (rate limits, mentions, streaming) |
| `src/ai/api-adapter.test.ts` | Unit tests for `AnthropicApiAdapter` (retries, prompts, filtering) |
| `src/config/index.test.ts` | Unit tests for environment config loading |
| `__tests__/wecom-crypto.test.ts` | Unit tests for AES/SHA1 crypto round-trips |
| `__tests__/bot.e2e.test.ts` | End-to-end flow tests for bot message handling |

## Mocking Strategy

- **SDK mocking**: Vitest `vi.mock()` used heavily to replace external dependencies
  - `@anthropic-ai/sdk` is mocked in `api-adapter.test.ts`
  - `WSClient` and `generateReqId` are mocked in bot tests via `vi.mock('../src')`
- **File-system mocking**: Tests use real `fs` reads/writes to temporary paths (`../.test-bot-state.json`)
- **Timer mocking**: Not used; tests rely on actual `setTimeout` / `setInterval` delays (e.g., 50ms waits in bot tests)

## Test Patterns

- Tests verify behavior through mock call inspection rather than direct return values
- E2E tests mock the AI adapter and WS client, so they are technically integration tests of the orchestrator layer
- Crypto tests verify round-trip correctness and edge cases (padding at block boundary)

## Coverage Gaps

- No tests for WebSocket reconnection logic (`ws.ts`)
- No tests for file download / decryption error paths
- No tests for media upload chunking failures
- No tests for the `OWN_CORP_ID` external-contact branch
- Chunker has an edge case (oversized single character) that is tested, but no negative-size or invalid-input tests

## CI

- GitHub Actions workflow at `.github/workflows/ci.yml`
- Runs on Node 22 with pnpm
- Steps: checkout → install → test → build
