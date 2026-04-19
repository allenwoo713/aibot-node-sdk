# Phase 4: AI API Validation & Reliability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 4-ai-api-validation-reliability
**Areas discussed:** Token overflow handling, Retry aggressiveness, Error surfacing pattern, Fallback messaging

---

## Area: Token overflow handling

**Q:** When conversation history exceeds maxInputTokens, what should happen?
- Truncate oldest messages
- Reject the call
- You decide

**A:** Truncate oldest messages

**Follow-up note:** User clarified that the ideal long-term behavior is conversation compaction/summarization, but that should be deferred as a TODO. For this phase, simple truncation is acceptable to get the pipeline working.

---

## Area: Retry aggressiveness

**Q:** What should the default retry policy be for AI API calls?
- Conservative — 1 retry
- Moderate — up to 3 retries
- Default-off — no retries

**A:** Conservative — 1 retry

---

## Area: Error surfacing pattern

**Q:** How should the AI adapter report failures to the rest of the SDK?
- Return in ChatResult (current pattern)
- Throw structured errors
- You decide

**A:** Return in ChatResult (current pattern)

**Follow-up note:** User noted that throwing structured errors (option 2) is more reasonable, but should be kept as a future TODO. Maintain the current pattern for this phase.

---

## Area: Fallback messaging

**Q:** Should the fallback message when the AI API fails be configurable in BotConfig?
- Yes — configurable per error type
- Yes — single configurable message
- No — keep hardcoded

**A:** Yes — configurable per error type

---

## Deferred Ideas Captured

1. Conversation compaction/summarization on token overflow
2. Throwing structured typed errors from AiBackend
