---
status: complete
phase: 05-persistent-conversation-storage
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
started: "2026-04-20T00:00:00Z"
updated: "2026-04-20T13:05:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Full test suite (98/98) passes with no errors after clearing temp state
result: pass

### 1a. JSON Persistence — Restart Retains History
expected: bot 能引用之前的内容，保持上下文连贯
result: pass
notes: "User confirmed. 6 messages verified in .bot-state.json."

### 1b. JSON Persistence — Bot Restart After Shutdown
expected: 重启后 bot 记得之前的对话内容
result: pass

### 2. SQLite Backend Switching
expected: PERSISTENCE_BACKEND=sqlite 时数据写入 SQLite
result: pass
notes: "SQLite .bot-state.db created, WAL enabled, 4 messages verified via query."

### 2b. SQLite Persistence Across Docker Restart
expected: 容器重启后历史还在
result: pass
notes: "Dockerfile 添加 VOLUME /app/data + ENV PERSISTENCE_PATH. 重启后 4 条消息保留，用户验证 bot 记得'口味虾'。"

### 3. Graceful Shutdown Flushes Saves
expected: SIGTERM 后数据完整保存
result: pass
notes: "SIGTERM 触发 graceful shutdown. SQLite 8 条消息保留，用户验证记得'下午3点开会'。"

### 4. Existing Behaviors Preserved
expected: 连发 5 条消息，bot 逐一回复不崩溃
result: pass
notes: "5 条消息全部收到，4 条 AI 正常回复，1 条 AI 返回 unknown error 后降级为 fallback 消息。Bot 未崩溃。"

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Fixes Applied

- Dockerfile: 添加 `VOLUME ["/app/data"]` + `ENV PERSISTENCE_PATH=/app/data/.bot-state.json`
- FallbackTransport: 修复 `isDuplicate()` 去重键为 `${msgid}:${eventName}`
