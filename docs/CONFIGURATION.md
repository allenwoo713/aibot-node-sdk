<!-- generated-by: gsd-doc-writer -->

# Configuration

This document describes all configuration options for the `@wecom/aibot-node-sdk` bot service. Configuration is loaded from environment variables at runtime via `src/config/index.ts`.

## Environment Variables

The following table lists every environment variable recognized by the bot. Variables marked **Required** will cause startup failure if missing or empty.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_ID` | **Yes** | — | WeCom bot ID from the admin console (智能机器人 -> 机器人 ID) |
| `SECRET` | **Yes** | — | WeCom bot Secret from the admin console |
| `ANTHROPIC_API_KEY` | **Yes** | — | Anthropic API key (or compatible provider key) |
| `ANTHROPIC_BASE_URL` | No | — | Base URL for Anthropic-compatible APIs (e.g., ModelScope, OpenRouter) <!-- VERIFY: provider-specific base URLs --> |
| `ANTHROPIC_MODEL` | No | `claude-3-5-sonnet-20241022` | Model identifier passed to the Anthropic Messages API |
| `CORP_ID` | No | `BOT_ID` | WeCom corp ID; required only for HTTP fallback transport |
| `AGENT_ID` | No | `BOT_ID` | WeCom agent ID; required only for HTTP fallback transport |
| `WS_URL` | No | `wss://openws.work.weixin.qq.com` | WebSocket endpoint URL; override for private deployments |
| `CONVERSATION_TTL_MS` | No | `1800000` | Time-to-live for in-memory conversations in milliseconds (30 min) |
| `MAX_CONVERSATIONS` | No | `1000` | Maximum number of concurrent conversations kept in memory |
| `MAX_HISTORY_MESSAGES` | No | `20` | Maximum messages retained per conversation history |
| `PERSISTENCE_PATH` | No | `./.bot-state.json` | File path for persisting conversation state |
| `PERSISTENCE_BACKEND` | No | `json` | Persistence backend: `json` or `sqlite` |
| `RATE_LIMIT_REQUESTS` | No | `10` | Max requests allowed per conversation per rate-limit window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window in milliseconds (60 sec) |
| `API_TIMEOUT_MS` | No | `30000` | Timeout for Anthropic API calls in milliseconds (30 sec) |
| `MAX_OUTPUT_TOKENS` | No | `2048` | Maximum output tokens per AI response |
| `MAX_INPUT_TOKENS` | No | `8192` | Max input tokens before truncating conversation history |
| `MAX_RETRIES` | No | `1` | Max retries for retryable AI API errors (429, 5xx, timeout) |
| `RETRY_BASE_DELAY_MS` | No | `2000` | Base delay in milliseconds before the first retry |
| `RETRY_BACKOFF_MULTIPLIER` | No | `2` | Exponential backoff multiplier between retries |
| `RETRY_JITTER` | No | `true` | Add random jitter to retry delays (`true`/`false`) |
| `FALLBACK_RATE_LIMIT` | No | `请求过于频繁，请稍后再试。` | User-facing fallback message when rate limited |
| `FALLBACK_AUTH_INVALID` | No | `AI 服务认证失败，请联系管理员。` | User-facing fallback message on AI auth failure |
| `FALLBACK_VALIDATION_FAILED` | No | `AI 返回了无效响应，请重试。` | User-facing fallback message on invalid AI response |
| `FALLBACK_RETRYABLE` | No | `服务暂时繁忙，请稍后再试。` | User-facing fallback message on generic retryable error |
| `INTERNAL_SYSTEM_PROMPT` | No | See `loadConfig` | System prompt used for internal (employee) contacts |
| `EXTERNAL_SYSTEM_PROMPT` | No | See `loadConfig` | System prompt used for external contacts |
| `OWN_CORP_ID` | No | — | Your WeCom corp ID; used to detect external contacts by comparing sender `corpid` |

## Required vs Optional Settings

The bot validates configuration at startup inside `loadConfig()` (`src/config/index.ts`). The following settings are **strictly required** and will throw an error if missing:

- `BOT_ID`
- `SECRET`
- `ANTHROPIC_API_KEY`

Additionally, the following validation rules apply:

- `PERSISTENCE_BACKEND` must be either `json` or `sqlite`; any other value throws `Invalid PERSISTENCE_BACKEND value: ...`.
- Integer variables parsed via `getEnvInt` throw if the value is non-numeric (e.g., `CONVERSATION_TTL_MS=not-a-number`).

## Defaults

Default values are hard-coded in `src/config/index.ts` via the `getEnv(key, defaultValue)` and `getEnvInt(key, defaultValue)` helpers. Key defaults include:

| Setting | Default Value |
|---------|---------------|
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` |
| `CONVERSATION_TTL_MS` | `1800000` (30 minutes) |
| `MAX_CONVERSATIONS` | `1000` |
| `MAX_HISTORY_MESSAGES` | `20` |
| `PERSISTENCE_PATH` | `./.bot-state.json` (resolved relative to `process.cwd()`) |
| `PERSISTENCE_BACKEND` | `json` |
| `RATE_LIMIT_REQUESTS` | `10` |
| `RATE_LIMIT_WINDOW_MS` | `60000` (60 seconds) |
| `API_TIMEOUT_MS` | `30000` (30 seconds) |
| `MAX_OUTPUT_TOKENS` | `2048` |
| `MAX_INPUT_TOKENS` | `8192` |
| `MAX_RETRIES` | `1` |
| `RETRY_BASE_DELAY_MS` | `2000` (2 seconds) |
| `RETRY_BACKOFF_MULTIPLIER` | `2` |
| `RETRY_JITTER` | `true` |

`CORP_ID` and `AGENT_ID` both default to the value of `BOT_ID` when not explicitly provided.

## Per-Environment Overrides

The project does not ship separate `.env.development` or `.env.production` files. To configure different values per environment, create environment-specific `.env` files and load them with your deployment platform's secret manager or Node.js built-in env-file support:

```bash
# Example: running with a production env file (Node.js >= 20.6)
node --env-file=.env.production dist/bot/entry.js
```

In containerized deployments, pass environment variables directly via `docker run -e BOT_ID=...` or through the orchestrator's secret management (e.g., Kubernetes Secrets, Docker Swarm secrets, or the platform dashboard).
