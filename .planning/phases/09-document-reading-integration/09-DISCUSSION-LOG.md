# Phase 9: Document Reading Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 09-document-reading-integration
**Areas discussed:** Command parsing and routing, Document lookup strategy, AI analysis approach, Error handling and user feedback

---

## Command Parsing and Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in BotOrchestrator | Add prefix check inside handleTextMessage before AI adapter | |
| Separate CommandRouter module | Dedicated `src/bot/commands/` router, cleaner separation, easier Phase 10 extension | ✓ |

**User's choice:** Separate CommandRouter module
**Notes:** User wants clean separation to make adding `/日程` in Phase 10 easier.

---

### Command Prefix Matching

| Option | Description | Selected |
|--------|-------------|----------|
| Exact prefix with args | `/文档 <name>` strict prefix, `/文档` alone triggers missing-name error | ✓ |
| Flexible prefix parsing | Support `/文档：name`, case-insensitive, more tolerant | |

**User's choice:** Exact prefix with args
**Notes:** Keep it strict and simple for MVP.

---

## Document Lookup Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Exact name match | Case-insensitive exact match against title; no match → not found error | |
| Substring match with top-1 pick | Filter docs where name contains query; 1 match → use it; 0 or >1 → clarify | ✓ |
| Fuzzy match with suggestions | Levenshtein scoring; threshold-based or top-3 list | |

**User's choice:** Substring match with top-1 pick
**Notes:** Practical middle ground. Lists matches when ambiguous.

---

## AI Analysis Approach

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot summarization | Single Claude call with doc + prompt; not added to memory | ✓ |
| Conversation memory injection | Document added as context message; enables follow-ups | |
| Hybrid: summary + pinned context | Summary first, then condensed doc in memory | |

**User's choice:** One-shot summarization
**Notes:** Keeps memory clean, avoids token bloat. Follow-ups go through normal chat.

---

## Error Handling and User Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Specific per error type | Different Chinese messages: not found, too large, API error, missing args | ✓ |
| Generic with optional detail | Base "抱歉，无法处理文档请求" with optional reason line | |

**User's choice:** Specific per error type
**Notes:** Consistent with existing Chinese UX. More helpful.

---

## Claude's Discretion

- Exact file/module naming within `src/bot/commands/`
- Whether CommandRouter is a class or plain function dispatcher
- WeCom micro-document list API pagination strategy
- Exact summarization prompt text
- Typed `getMicroDocument()` vs inline endpoint strings

## Deferred Ideas

- `/文档 列表` command
- Document content in conversation memory for follow-ups
- Fuzzy/Levenshtein name matching
- Function calling mode for natural language queries
- Full document CRUD
