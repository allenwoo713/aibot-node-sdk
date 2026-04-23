# Phase 10: Schedule Management Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 10-schedule-management-integration
**Areas discussed:** Natural language parsing, Command parser structure, Schedule listing scope

---

## Natural Language Parsing

| Option | Description | Selected |
|--------|-------------|----------|
| AI-powered extraction | Claude parses title/time/attendees from natural language | |
| Regex/manual parsing | Extract common Chinese date patterns locally | |
| Structured format required | User must type `/日程 创建 标题 \| 时间` | |
| **Layered hybrid** | **Regex fast path → AI fallback → prompt user** | **✓** |

**User's choice:** Layered hybrid approach
**Notes:** User provided a detailed three-layer architecture diagram:
- Layer 1: Regex fast path for high-confidence patterns (明天/后天/下周X/X点/X:XX)
- Layer 2: AI extraction (Claude) for complex/ambiguous/non-standard expressions
- Layer 3: Fallback prompt to user if AI cannot extract required fields (e.g., missing time)

---

## Command Parser Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Monolithic | Keep all commands in `commands/index.ts` | |
| **Split by domain** | **`commands/document.ts` + `commands/schedule.ts` + router** | **✓** |

**User's choice:** Split by domain
**Notes:** Aligns with Phase 9 D-01's original `CommandRouter` intent. Existing `/文档` logic moves to `document.ts`, new `/日程` logic lives in `schedule.ts`, and `index.ts` becomes a thin delegating router.

---

## Schedule Listing Scope

| Option | Description | Selected |
|--------|-------------|----------|
| **Next 5 upcoming** | **Concise, always relevant, easy to scan** | **✓** |
| Today only | Highly focused, no clutter | |
| Next 7 days | Full weekly view | |
| Today + next 3 | Balanced focus and lookahead | |

**User's choice:** Next 5 upcoming
**Notes:** Sorted by start time ascending. Formatted as numbered list: `1. {title} — {YYYY-MM-DD HH:mm}`

---

## Claude's Discretion

- Attendee mapping: default to `frame.body.from.userid` directly (not discussed)
- Exact regex patterns for Layer 1
- AI extraction prompt wording
- Exact confirmation and empty-state message format
- WeCom schedule API endpoint selection

## Deferred Ideas

- Schedule modification/deletion — OOS-09
- Multiple attendees — OOS-11
- Reminder notifications — OOS-10
