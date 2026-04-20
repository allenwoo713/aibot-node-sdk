# Milestone v1.2 Requirements

**Status:** In Progress
**Milestone:** WeCom Ecosystem Extension

---

## Active

### DOCKER — Docker Compose Deployment

- [ ] **DOCKER-01**: Developer can start the bot service with a single `docker compose up` command
- [ ] **DOCKER-02**: Compose configuration includes health check endpoint for container orchestration
- [ ] **DOCKER-03**: Conversation persistence data survives container restarts via named volume
- [ ] **DOCKER-04**: Environment variables are loaded from `.env` file for local development

### WECOM — WeCom Open Platform API Client

- [ ] **WECOM-01**: SDK obtains and caches `access_token` using `corpId` + `secret` from BotConfig
- [ ] **WECOM-02**: `access_token` is automatically refreshed before expiry without manual intervention
- [ ] **WECOM-03**: API client handles common error codes (40014 token expired, 40001 token invalid) with retry
- [ ] **WECOM-04**: API client is exposed in SDK public exports for advanced consumers

### DOC — Document Reading

- [ ] **DOC-01**: Bot can download and read WeCom micro-document (微盘文档) content via Open Platform API
- [ ] **DOC-02**: Downloaded document content is passed to Claude for analysis and summarization
- [ ] **DOC-03**: User can trigger document analysis via `/文档` command followed by document name or ID
- [ ] **DOC-04**: Bot replies with a structured summary or answers specific questions about the document

### SCHED — Schedule Management

- [ ] **SCHED-01**: Bot can create a WeCom schedule (日程) via `/日程 创建` command with natural date/time description
- [ ] **SCHED-02**: Bot can query upcoming schedules via `/日程 列表` command
- [ ] **SCHED-03**: Created schedules include correct attendee (the user who sent the command)
- [ ] **SCHED-04**: Bot confirms schedule creation with summary (title, time, attendees)

### BOT — Bot Command Integration

- [ ] **BOT-01**: Bot parses incoming text messages for `/文档` and `/日程` command prefixes
- [ ] **BOT-02**: Bot provides helpful error message when command arguments are missing or invalid
- [ ] **BOT-03**: Bot falls back to normal AI chat when message is not a recognized command
- [ ] **BOT-04**: Command handling preserves existing rate limiting and conversation memory

### TEST — Test Coverage

- [ ] **TEST-01**: access_token refresh logic is covered by unit tests (mocked HTTP)
- [ ] **TEST-02**: Document download and analysis flow is covered by integration tests
- [ ] **TEST-03**: Schedule create/query commands are covered by integration tests
- [ ] **TEST-04**: Command parser and router are covered by unit tests

## Out of Scope

| ID | Item | Reason |
|----|------|--------|
| OOS-07 | Function calling / tool use mode for API invocation | Fixed-command mode chosen for v1.2 reliability; function calling deferred |
| OOS-08 | Full document CRUD (create, update, share, permission) | Only reading is needed for AI analysis; write operations deferred |
| OOS-09 | Schedule modification and deletion | Create + query covers primary use case; update/delete deferred |
| OOS-10 | Reminder notifications / webhook push | Requires external cron or push infrastructure; deferred |
| OOS-11 | Multiple attendees in schedule creation | Single-attendee (command sender) covers MVP; multi-attendee deferred |
| OOS-12 | Document type detection for spreadsheets, forms, etc. | Plain text extraction covers MVP; type-specific parsing deferred |

## Future

- Function calling mode for natural language API invocation
- Full micro-document lifecycle (create, edit, share, permissions)
- Schedule update, delete, and reminder notifications
- Meeting room booking integration
- Approval workflow integration
- Contact/customer management integration

## Traceability

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| WECOM-01 | 7 | — | Pending |
| WECOM-02 | 7 | — | Pending |
| WECOM-03 | 7 | — | Pending |
| WECOM-04 | 7 | — | Pending |
| DOCKER-01 | 8 | — | Pending |
| DOCKER-02 | 8 | — | Pending |
| DOCKER-03 | 8 | — | Pending |
| DOCKER-04 | 8 | — | Pending |
| DOC-01 | 9 | — | Pending |
| DOC-02 | 9 | — | Pending |
| DOC-03 | 9 | — | Pending |
| DOC-04 | 9 | — | Pending |
| BOT-01 | 9 | — | Pending |
| BOT-02 | 9 | — | Pending |
| BOT-04 | 9 | — | Pending |
| SCHED-01 | 10 | — | Pending |
| SCHED-02 | 10 | — | Pending |
| SCHED-03 | 10 | — | Pending |
| SCHED-04 | 10 | — | Pending |
| BOT-03 | 10 | — | Pending |
| TEST-01 | 11 | — | Pending |
| TEST-02 | 11 | — | Pending |
| TEST-03 | 11 | — | Pending |
| TEST-04 | 11 | — | Pending |

---
*Last updated: 2026-04-20*
