# Phase 10: Schedule Management Integration - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and query WeCom schedules via natural-language bot commands.

Bot handles `/日程 创建 <description>` and `/日程 列表` commands to:
1. Parse and route schedule commands (distinguishing from normal AI chat and document commands)
2. Extract structured schedule fields (title, start_time, end_time) from natural-language descriptions
3. Create schedules in WeCom via Open Platform API with the command sender as attendee
4. Confirm schedule creation with a summary showing title, time, and attendees
5. List upcoming schedules in a concise, readable format
6. Fall back to normal AI chat when the message is not a recognized command

Command handling preserves existing rate limiting and conversation memory behavior.

</domain>

<decisions>
## Implementation Decisions

### Natural Language Parsing (Layered Hybrid)
- **D-01:** Three-layer extraction strategy for `/日程 创建 <description>`:
  - **Layer 1 — Regex fast path:** Parse high-confidence Chinese date/time patterns locally (e.g., 明天, 后天, 下周X, X点, X:XX). If match succeeds with high confidence, build structured fields directly and skip AI.
  - **Layer 2 — AI extraction fallback:** If regex fails or confidence is low, send the description to Claude via `AnthropicApiAdapter` with a structured extraction prompt. Expect JSON response with `title`, `start_time`, `end_time` fields.
  - **Layer 3 — User prompt fallback:** If AI extraction cannot determine required fields (e.g., time is missing), reply to the user asking for the minimum necessary information rather than guessing.

### Command Parser Structure
- **D-02:** Split command parsing by domain, mirroring the Phase 9 D-01 intent:
  - `src/bot/commands/document.ts` — existing `/文档` command (moved from current `commands/index.ts`)
  - `src/bot/commands/schedule.ts` — new `/日程 创建` and `/日程 列表` commands
  - `src/bot/commands/index.ts` — thin router that inspects message prefix and delegates to the appropriate domain module
- **D-03:** Exact prefix matching for subcommands: `/日程 创建 ` (trailing space required) and `/日程 列表` (exact match, optional trailing space). `/日程` alone triggers a usage hint.

### Schedule Listing Scope
- **D-04:** `/日程 列表` returns the **next 5 upcoming schedules**, sorted by start time ascending.
- **D-05:** Format as a numbered list with one line per schedule: `1. {title} — {YYYY-MM-DD HH:mm}`. If no schedules exist, reply with a friendly empty-state message in Chinese.

### Attendee Mapping
- **D-06:** Use `frame.body.from.userid` directly as the schedule attendee. The WeCom Open Platform schedule API accepts user IDs for attendees; no additional user lookup is required for the MVP.

### Error Handling and User Feedback
- **D-07:** Schedule-specific error messages in Chinese, following Phase 9 D-05 pattern:
  - Missing or ambiguous description: prompt user for title and time
  - WeCom API error: "日程创建失败，请稍后重试。"
  - Schedule list empty: "暂无 upcoming 日程。"

### Claude's Discretion
- Exact regex patterns and coverage for Layer 1 fast path
- AI extraction prompt wording and JSON schema
- Exact schedule confirmation message format
- WeCom schedule API endpoint details (downstream research will identify the correct endpoint)
- Error message wording refinements
- Whether to add schedule list caching

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 10 goal, success criteria, and requirement mapping (SCHED-01 to SCHED-04, BOT-03)
- `.planning/REQUIREMENTS.md` — Schedule management and bot command requirements
- `.planning/PROJECT.md` — v1.2 milestone context

### Prior Phase Decisions
- `.planning/phases/07-wecom-api-client-foundation/07-CONTEXT.md` — `request<T>()` generic API, token refresh, error retry patterns
- `.planning/phases/09-document-reading-integration/09-CONTEXT.md` — Command parsing patterns (D-01, D-02, D-05), rate limiting on commands, Chinese error messages

### Existing Code
- `src/bot/commands/index.ts` — Existing `/文档` command parser and handler (to be refactored into domain modules)
- `src/bot/index.ts` — `BotOrchestrator` message handling flow
- `src/bot/index.test.ts` — Existing bot test patterns
- `src/api.ts` — `WeComApiClient` with `request<T>()` for generic WeCom Open Platform calls
- `src/types/wecom-api.ts` — WeCom API type definitions
- `src/ai/adapter.ts` — `AiBackend` interface (`chat()`, `ChatOptions`, `ChatResult`)
- `src/config/index.ts` — `BotConfig` fields
- `src/memory.ts` — `ConversationStore` append/build behavior
- `src/chunker.ts` — `chunkMessage()` for long reply streaming

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WeComApiClient.request<T>()` — Generic HTTP wrapper for any WeCom Open Platform endpoint; handles token injection and refresh transparently
- `AnthropicApiAdapter.chat()` — Single-call interface for Claude; used for Layer 2 AI extraction
- `BotOrchestrator.handleTextMessage()` — Current message entry point; command router intercepts before AI adapter call
- `chunkMessage()` + `transport.sendStream()` — Existing reply chunking for long responses
- `BotOrchestrator.sendText()` — Direct text reply bypassing AI (useful for error messages and confirmations)

### Established Patterns
- **Command interception before AI call:** `parseCommand()` runs before `adapter.chat()` in `handleTextMessage()`
- **Rate limiting per conversation:** `isRateLimited()` runs for all messages including commands
- **Chinese user-facing errors:** All fallback messages are in Chinese
- **Best-effort error suppression:** Catch errors, log, return fallback string rather than throwing to user
- **Domain-split commands:** Phase 9 CONTEXT.md originally envisioned a `CommandRouter`; Phase 10 realizes this with `document.ts` + `schedule.ts` + router

### Integration Points
- **New code connects in `BotOrchestrator.handleTextMessage()`** — after `/文档` interception, add `/日程` interception
- **`WeComApiClient` needs schedule endpoints** — `request<T>()` will be used for schedule create and list calls
- **`src/bot/commands/index.ts` becomes a router** — existing document logic moves to `document.ts`
- **No changes to `AiBackend` interface** — Layer 2 extraction uses existing `chat()` with a crafted system prompt
- **Conversation memory is bypassed for schedule commands** — same as document commands (Phase 9 pattern)

</code_context>

<specifics>
## Specific Ideas

- Layer 1 regex should cover: 明天, 后天, 下周X (X=一–日), 今天, X点, X:XX, 半小时, 一小时
- AI extraction prompt idea: "从以下描述中提取日程标题、开始时间、结束时间，返回 JSON: {title, start_time, end_time}"
- Schedule confirmation idea: "已创建日程：周会\n时间：2026-04-24 15:00\n参与人：user-1"
- Empty state idea: "暂无 upcoming 日程。发送 `/日程 创建 <描述>` 来创建一个。"

</specifics>

<deferred>
## Deferred Ideas

- Schedule modification and deletion — out of scope per REQUIREMENTS.md (OOS-09)
- Multiple attendees in schedule creation — out of scope per REQUIREMENTS.md (OOS-11)
- Reminder notifications / webhook push — out of scope per REQUIREMENTS.md (OOS-10)
- Function calling / tool use mode for natural language schedule commands — explicitly out of scope per v1.2 roadmap (OOS-07)

</deferred>

---

*Phase: 10-schedule-management-integration*
*Context gathered: 2026-04-23*
