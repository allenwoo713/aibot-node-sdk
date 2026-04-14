# External Integrations

**Analysis Date:** 2026-04-14

## APIs & External Services

**WeCom (WeChat Work) Smart Bot Platform:**
- WebSocket long-lived connection to `wss://openws.work.weixin.qq.com`
- Used for: message receive, event callbacks, passive/active replies, media upload
- Client: `ws` (WebSocket library)
- Auth: `BOT_ID` + `SECRET` sent in `aibot_subscribe` frame

**Anthropic Claude API:**
- Used for: AI chat completions powering bot replies
- SDK: `@anthropic-ai/sdk` ^0.88.0
- Auth: `ANTHROPIC_API_KEY`
- Default model: `claude-3-5-sonnet-20241022`

**HTTP File Download:**
- Used for: downloading encrypted images/files/videos from WeCom
- Client: `axios` ^1.6.7
- No persistent auth; URLs are time-limited and fetched via WebSocket messages

## Data Storage

**Databases:**
- None (no SQL/NoSQL database)

**File Storage:**
- Local filesystem only
- Conversation state persisted to JSON file (default: `./.bot-state.json`)
- Media downloads saved to local disk in examples

**Caching:**
- In-memory `Map<string, ConversationRecord>` in `ConversationStore`
- TTL eviction, LRU cap, sliding window truncation

## Authentication & Identity

**Auth Provider:**
- WeCom bot authentication (custom): `bot_id` + `secret` frame-based auth over WebSocket
- Anthropic API key bearer token

**Contact Classification:**
- Internal vs external contact detection based on `external` flag and `OWN_CORP_ID` comparison

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/DataDog/etc.)

**Logs:**
- Custom `Logger` interface with `DefaultLogger` implementation (`src/logger.ts`)
- Console-based with timestamps and prefix (`[AiBotSDK]`)
- Levels: debug, info, warn, error

## CI/CD & Deployment

**Hosting:**
- Docker container (Node.js 22 Alpine)
- Not tied to a specific cloud platform

**CI Pipeline:**
- GitHub Actions workflows directory present (`.github/workflows`)
- Specific workflow files not read

## Environment Configuration

**Required env vars:**
- `BOT_ID` - WeCom bot ID
- `SECRET` - WeCom bot secret
- `ANTHROPIC_API_KEY` - Anthropic API key

**Optional env vars:**
- `ANTHROPIC_MODEL` - Model selection
- `WS_URL` - Custom WebSocket endpoint
- `CONVERSATION_TTL_MS` / `MAX_CONVERSATIONS` / `MAX_HISTORY_MESSAGES` - Memory limits
- `PERSISTENCE_PATH` - State file path
- `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW_MS` - Per-conversation rate limits
- `API_TIMEOUT_MS` / `MAX_OUTPUT_TOKENS` - Anthropic API limits
- `INTERNAL_SYSTEM_PROMPT` / `EXTERNAL_SYSTEM_PROMPT` - Prompt customization
- `OWN_CORP_ID` - Corp ID for external contact detection

**Secrets location:**
- `.env` file (ignored in `.gitignore`)
- Environment variables at runtime

## Webhooks & Callbacks

**Incoming:**
- WebSocket frames from WeCom server:
  - `aibot_msg_callback` - incoming messages
  - `aibot_event_callback` - events (enter_chat, template_card_event, feedback_event, disconnected_event)

**Outgoing:**
- WebSocket frames to WeCom server:
  - `aibot_respond_msg` - reply to messages
  - `aibot_respond_welcome_msg` - welcome replies
  - `aibot_respond_update_msg` - update template cards
  - `aibot_send_msg` - proactive messages
  - `aibot_upload_media_init` / `chunk` / `finish` - media upload flow

---

*Integration audit: 2026-04-14*
