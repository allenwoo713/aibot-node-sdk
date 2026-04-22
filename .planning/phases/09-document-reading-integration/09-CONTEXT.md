# Phase 9: Document Reading Integration - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can ask the bot to analyze WeCom micro-documents via a simple chat command.

Bot handles `/文档 <document-name>` command to:
1. Parse and route the command (distinguishing from normal AI chat)
2. Look up the specified WeCom micro-document by name via Open Platform API
3. Download the document content
4. Pass the content to Claude for analysis and summarization
5. Reply with a structured summary
6. Provide helpful error messages for missing/invalid arguments or documents not found

Command handling preserves existing rate limiting and conversation memory behavior.

</domain>

<decisions>
## Implementation Decisions

### Command Parsing and Routing
- **D-01:** Command parsing lives in a dedicated module under `src/bot/commands/` (e.g., `CommandRouter`). This cleanly separates command dispatch from AI chat flow and makes adding Phase 10's `/日程` commands straightforward.
- **D-02:** Exact prefix matching for `/文档 <name>`. The bot checks if the message starts with `/文档 ` (with trailing space). `/文档` alone (no name) triggers a "missing document name" error reply. No fuzzy command aliases in this phase.

### Document Lookup Strategy
- **D-03:** Substring match (case-insensitive) against document titles. The bot lists available micro-documents via WeCom API, then filters client-side. Exactly one match → proceed with download. Zero matches → "未找到名为 'X' 的文档". Multiple matches → reply with a numbered list asking the user to clarify.

### AI Analysis Approach
- **D-04:** One-shot summarization. The downloaded document text is combined with a summarization system prompt and sent to Claude in a single `AiBackend.chat()` call. The resulting summary is streamed back to the user as a normal bot reply. The document content is **not** appended to conversation memory — this avoids bloating the LRU cache and keeps follow-up questions in normal AI chat mode without stale document context.

### Error Handling and User Feedback
- **D-05:** Specific error messages per failure type, in Chinese to match existing UX:
  - Missing document name: "请提供文档名称，例如：/文档 项目计划"
  - Document not found (zero matches): "未找到名为 'X' 的文档，请检查名称是否正确。"
  - Multiple matches: "找到多个匹配的文档：\n1. X\n2. Y\n请发送 /文档 <完整名称> 指定具体文档。"
  - Document too large for AI context: "文档内容过长，目前不支持分析超过 X 字的文档。"
  - WeCom API error: "企微 API 暂时不可用，请稍后重试。"

### Claude's Discretion
- Exact file/module naming within `src/bot/commands/`
- Whether CommandRouter is a class or plain function dispatcher
- How the WeCom micro-document list API is paginated (if at all) and how many docs to fetch
- The exact summarization prompt text sent to Claude
- Whether to expose a typed `getMicroDocument()` method on `WeComApiClient` vs inline endpoint strings in the bot layer

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 9 goal, success criteria, and requirement mapping (DOC-01 to DOC-04, BOT-01, BOT-02, BOT-04)
- `.planning/REQUIREMENTS.md` — Document reading and bot command requirements
- `.planning/PROJECT.md` — v1.2 milestone context

### Prior Phase Decisions
- `.planning/phases/07-wecom-api-client-foundation/07-CONTEXT.md` — `request<T>()` generic API, token refresh, error retry patterns
- `.planning/phases/05-persistent-conversation-storage/05-CONTEXT.md` — Async I/O patterns, conversation memory behavior

### Existing Code
- `src/bot/index.ts` — `BotOrchestrator` message handling flow
- `src/bot/index.test.ts` — Existing bot test patterns
- `src/api.ts` — `WeComApiClient` with `request<T>()` for generic WeCom Open Platform calls
- `src/ai/adapter.ts` — `AiBackend` interface (`chat()`, `ChatOptions`, `ChatResult`)
- `src/memory.ts` — `ConversationStore` append/build behavior
- `src/types/message.ts` — `TextMessage` structure
- `src/config/index.ts` — `BotConfig` fields

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WeComApiClient.request<T>()` — Generic HTTP wrapper for any WeCom Open Platform endpoint; handles token injection and refresh transparently
- `BotOrchestrator.handleTextMessage()` — Current message entry point; command router will intercept before AI adapter call
- `AiBackend.chat()` — Single-call interface for Claude; accepts `history` array for context
- `chunkMessage()` + `transport.sendStream()` — Existing reply chunking for long responses
- `BotOrchestrator.sendText()` — Direct text reply bypassing AI (useful for error messages)

### Established Patterns
- **Event-driven transport**: Bot listens on `transport.on('message.text', ...)` — command handling is synchronous before async AI call
- **Rate limiting**: `isRateLimited()` runs per-conversation; command requests should count toward the same limit
- **Chinese error messages**: All user-facing fallbacks are in Chinese (e.g., "请求太多了，请稍后再试。")
- **Best-effort error suppression**: Catch errors, log, return fallback string rather than throwing to user
- **Async I/O for state**: Phase 5 established async file I/O patterns

### Integration Points
- **New code connects in `BotOrchestrator.handleTextMessage()`** — before the `adapter.chat()` call, check if content is a command
- **`WeComApiClient` needs new micro-document endpoints** — likely via `request<T>()` or a typed wrapper
- **No changes to `AiBackend` interface** — one-shot summarization uses existing `chat()` with a crafted prompt
- **Conversation memory (`ConversationStore`) is bypassed for document commands** — no `append()` for the document text itself

</code_context>

<specifics>
## Specific Ideas

- Command prefix: `/文档 ` (note the trailing space). This is unambiguous and leaves room for future `/文档 列表` if needed.
- Document name matching: case-insensitive, trimmed, with Unicode-aware `toLowerCase()` or locale-insensitive comparison.
- Summarization prompt idea: "请用中文总结以下文档的主要内容，列出关键要点："
- If the document content exceeds `maxInputTokens`, truncate with a warning note in the summary rather than failing outright.

</specifics>

<deferred>
## Deferred Ideas

- `/文档 列表` command to list all available documents — nice-to-have, not required for MVP
- Document content added to conversation memory for follow-up Q&A — deferred to keep memory clean; can be revisited if users ask for it
- Fuzzy/Levenshtein matching for document names — substring is sufficient for MVP
- Function calling / tool use mode for natural language document queries — explicitly out of scope per v1.2 roadmap (OOS-07)
- Full document CRUD (create, update, share) — out of scope per REQUIREMENTS.md (OOS-08)

</deferred>

---

*Phase: 09-document-reading-integration*
*Context gathered: 2026-04-22*
