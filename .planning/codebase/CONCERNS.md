# Concerns

## Technical Debt

- **Request-based rate limiting only**: `BotOrchestrator.isRateLimited()` counts requests per conversation, not tokens. A single 2,048-token reply costs the same as a 10-token ping. Documented in `TODOS.md` as a known gap.
- **Synchronous file I/O in `ConversationStore`**: `fs.readFileSync` / `fs.writeFileSync` block the event loop on every message (`load` in constructor, `save` on every `append`). This will not scale under load.
- **Hardcoded `console.error` in `BotOrchestrator`**: `setupEventHandlers()` uses `console.error` directly instead of the injected logger, bypassing any centralized log collector.
- **`any` cast for mention detection**: `shouldReply()` casts `frame.body as any` to inspect `mention` / `mention_list` because the type definitions do not expose this metadata.

## Known Bugs / Edge Cases

- **Chunker edge case**: `chunkMessage()` places an oversized single character in its own chunk even when it exceeds `maxBytes`. This is tested behavior, but callers may still hit downstream size limits.
- **Anthropic adapter swallows non-retryable errors**: `AnthropicApiAdapter.chat()` catches all exceptions and returns a generic fallback, making it impossible for callers to distinguish auth failures from rate limits or content-policy blocks.
- **Retry logic is limited**: `callWithRetry()` retries once for 5xx and once for 429, with fixed delays (2s / 10s). No exponential backoff or jitter.

## Security

- **Secrets management**: API keys (`ANTHROPIC_API_KEY`, `BOT_ID`, `SECRET`) are loaded only from environment variables — no secrets committed to source.
- **No URL validation on file downloads**: `WSClient.downloadFile()` passes the provided URL directly to `axios.get()` without validation.
- **AES key reuse as IV**: `WecomCrypto` uses the same key-derived buffer for both AES key and IV per the WeCom protocol implementation. This is protocol-mandated but cryptographically suboptimal.
- **Missing DLP for message history**: Entire conversation histories are forwarded to Anthropic without redaction of PII, URLs, or confidential data. Flagged in `TODOS.md`.

## Performance Bottlenecks

- **Synchronous JSON persistence**: Every message append triggers `fs.writeFileSync` serializing the entire in-memory store to a single JSON file.
- **Unbounded rate-limit Map**: `rateLimits` in `BotOrchestrator` grows with each unique conversation ID and is never pruned.
- **No request pooling for Anthropic**: Each `chat()` call creates an independent SDK request with no connection keep-alive tuning documented.

## Fragile Areas

- **WebSocket binary frame handling**: `WsConnectionManager` expects JSON text frames; binary or malformed frames could crash the parser.
- **Exponential backoff overflow risk**: Reconnect delay calculation could theoretically overflow if `reconnectAttempts` grows unbounded before the cap logic is applied.
- **Direct `process.env.OWN_CORP_ID` usage**: `detectContactType()` reads `process.env.OWN_CORP_ID` at runtime on every message instead of resolving it once at startup.

## Scaling Limits

- **Single JSON persistence file**: All conversation state is written to one file (`PERSISTENCE_PATH`). Concurrent processes will corrupt or overwrite each other’s state.
- **500-message reply queue cap**: `maxReplyQueueSize` is a safety valve, but backpressure strategy is reject-only.
- **In-memory conversation store**: No eviction of `rateLimits` entries; long-lived process with many unique conversations will leak memory.

## Dependencies at Risk

- **Single AI provider**: Hard dependency on `@anthropic-ai/sdk` with no abstraction for failover or multi-provider support beyond the `AiBackend` interface.
- **Core `ws` transport**: All real-time messaging depends on the `ws` package; no HTTP fallback path exists.

## Missing Critical Features

- Token budgeting / cost guard
- Structured logging / metrics (only console-based `DefaultLogger` exists)
- Graceful shutdown with in-flight request draining
- Health-check endpoint or readiness probe
