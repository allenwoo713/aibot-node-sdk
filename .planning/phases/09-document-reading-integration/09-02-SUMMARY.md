---
phase: 09-document-reading-integration
plan: 02
status: complete
completed: "2026-04-23"
---

# Plan 09-02 Summary: Document Command Router and Bot Integration

## What Was Built

Created a dedicated command router module and integrated it into `BotOrchestrator` so that `/文档 <docid|url>` commands are intercepted, processed through document download + AI summarization, and replied to the user — while preserving existing rate limiting and memory behavior.

## Changes

- `src/bot/commands/index.ts` (new):
  - `parseCommand(content)` — detects `/文档` commands and extracts argument
  - `handleDocumentCommand()` — validates input, downloads doc via `getDocContent`, truncates if needed, one-shot AI summarization with Chinese prompt
  - All error paths return specific Chinese messages
- `src/bot/index.ts`:
  - Imports `WeComApiClient`, `parseCommand`, `handleDocumentCommand`
  - Adds `private apiClient: WeComApiClient` field
  - Instantiates `WeComApiClient` in constructor
  - Intercepts `/文档` commands after rate limiting, streams reply without touching `ConversationStore`
  - Stops `apiClient` on shutdown

## Self-Check

- `npx tsc --noEmit` passes with no new errors
- Command path does not call `store.append` or `store.buildMessages` (verified by grep)
- Rate limiting check runs before command interception
- Non-command messages fall through to existing AI chat flow unchanged

## Deviations

None.
