# Phase 10: Schedule Management Integration — Research

**Researched:** 2026-04-24
**Status:** Complete

---

## 1. WeCom Schedule API

### 1.1 Create Schedule — `POST /oa/schedule/add`

Creates a schedule (日程) in the user's WeCom calendar.

**Endpoint:** `https://qyapi.weixin.qq.com/cgi-bin/oa/schedule/add`

**Request Body:**
```json
{
  "schedule": {
    "organizer": "USERID",
    "start_time": 1600137600,
    "end_time": 1600141200,
    "attendees": [
      { "userid": "USERID" }
    ],
    "summary": "Meeting Title",
    "description": "Optional description",
    "is_remind": 1,
    "remind_before_event_secs": 3600,
    "location": "Optional location",
    "cal_id": "CALENDAR_ID"
  }
}
```

**Key Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organizer` | string | Yes | User ID of the schedule creator |
| `start_time` | int | Yes | Unix timestamp (seconds) |
| `end_time` | int | Yes | Unix timestamp (seconds) |
| `attendees` | array | No | Array of `{ userid: string }` objects |
| `summary` | string | Yes | Schedule title |
| `description` | string | No | Schedule description |
| `is_remind` | int | No | 0=no reminder, 1=remind |
| `remind_before_event_secs` | int | No | Seconds before event to remind |
| `location` | string | No | Location string |
| `cal_id` | string | No | Calendar ID; if omitted, uses default calendar |

**Response:**
```json
{
  "errcode": 0,
  "errmsg": "ok",
  "schedule_id": "SCHEDULE_ID"
}
```

**Notes:**
- The `organizer` field is mandatory. For our use case, we set it to the command sender's `userid`.
- `attendees` also includes the sender (same `userid`) so they see it in their calendar.
- `cal_id` can be omitted for the user's default calendar.
- Times must be Unix timestamps in **seconds** (not milliseconds).

### 1.2 Get Schedule — `POST /oa/schedule/get`

Retrieves a single schedule by ID.

**Endpoint:** `https://qyapi.weixin.qq.com/cgi-bin/oa/schedule/get`

**Request Body:**
```json
{
  "schedule_id": "SCHEDULE_ID"
}
```

**Response:** Returns the full schedule object (same structure as `schedule` in create request, plus `schedule_id`).

### 1.3 List Schedules — Gap Analysis

WeCom Open Platform does **not** provide a direct "list upcoming schedules for a user" API. The available options:

1. **`POST /oa/schedule/get_by_calendar`** — Gets schedules within a calendar by time range. Requires `cal_id`.
2. **Application message callback** — WeCom can push schedule change events to the callback URL, but this requires setup.
3. **Simulated list via created schedules** — The bot can maintain a lightweight local index of schedules it created (mapping `schedule_id` → metadata) and query those.

**Decision for Phase 10:**
Since the goal is MVP functionality and the bot is the one creating schedules, we use **Option 3 (local index)** combined with `get_by_calendar` if needed. However, given the complexity, a simpler approach for the MVP:

- After creating a schedule, store `(schedule_id, summary, start_time, userid)` in a simple JSON file (`schedules.json` alongside `conversations.json`).
- For `/日程 列表`, read this local index, filter by the requesting user's `userid`, sort by `start_time`, and return the next 5.
- This avoids needing `cal_id` discovery and calendar-level permissions.

**Alternative (if local index is rejected):**
Use `POST /oa/schedule/get_by_calendar` with the user's default calendar. But discovering `cal_id` requires an extra API call (`/oa/calendar/get` or `/oa/calendar/get_default`), which may not exist in all WeCom editions.

**Recommendation:** Use local index approach (simple JSON persistence) for MVP. It is reliable, fast, and fully under bot control.

---

## 2. Existing Codebase Patterns

### 2.1 Command Parser (`src/bot/commands/index.ts`)

Currently handles only `/文档`:
- `parseCommand(content)` returns `ParsedCommand | null`
- `handleDocumentCommand(arg, apiClient, adapter, contactType, config, logger)` returns `Promise<string>`
- Pattern: parse → validate → call API → call AI → return reply string
- Errors are caught and returned as Chinese strings (never thrown to user)

**Refactor needed:** Split into domain modules per CONTEXT.md D-02:
- `src/bot/commands/document.ts` — move existing document logic
- `src/bot/commands/schedule.ts` — new schedule logic
- `src/bot/commands/index.ts` — thin router

### 2.2 BotOrchestrator (`src/bot/index.ts`)

`handleTextMessage()` flow:
1. `shouldReply(frame)` — filter logic
2. `isRateLimited(conversationId)` — rate limiting
3. `parseCommand(content)` — command interception (currently only `/文档`)
4. If command matched → handle command → `chunkMessage()` → `sendStream()`
5. If no command → normal AI chat flow

**Integration point:** After step 3, add schedule command parsing and handling (same pattern as document commands).

### 2.3 WeComApiClient (`src/api.ts`)

- `request<T>(method, endpoint, params?, data?)` — generic wrapper with token injection and retry
- Already used for `/doc/get_doc_content`, `/message/send`
- Schedule endpoints will use the same `request<T>()` method

**New methods needed on WeComApiClient:**
- `createSchedule(scheduleData)` → calls `request('POST', '/oa/schedule/add', undefined, { schedule: scheduleData })`
- `getSchedule(scheduleId)` → calls `request('POST', '/oa/schedule/get', undefined, { schedule_id: scheduleId })`

### 2.4 Type Definitions (`src/types/wecom-api.ts`)

Currently has:
- `TokenCache`, `GetTokenResponse`, `WeComApiError`, `GetDocContentResponse`

**New types needed:**
- `CreateScheduleRequest` / `CreateScheduleResponse`
- `GetScheduleRequest` / `GetScheduleResponse`
- `ScheduleAttendee`, `ScheduleData`

### 2.5 AI Adapter (`src/ai/adapter.ts`)

- `AiBackend.chat(options: ChatOptions)` → returns `ChatResult`
- Used for Layer 2 extraction: send natural language description to Claude with a structured extraction prompt
- `history: []` (empty) for extraction calls since they are one-shot
- `conversationId` can be `schedule-extract-{timestamp}` for tracking

---

## 3. Natural Language Date/Time Parsing

### 3.1 Layer 1 — Regex Fast Path (Chinese)

Common Chinese temporal expressions to support:

| Expression | Meaning | Regex Pattern | Result (relative to now) |
|------------|---------|---------------|--------------------------|
| 今天 | today | `/今天/` | `YYYY-MM-DD` |
| 明天 | tomorrow | `/明天/` | `YYYY-MM-DD + 1d` |
| 后天 | day after tomorrow | `/后天/` | `YYYY-MM-DD + 2d` |
| 下周X | next week day X | `/下周([一二三四五六日])/` | Next occurrence of weekday |
| 下下周一 | Monday after next | `/下下([一二三四五六日])/` | +2 weeks weekday |
| X点 | X o'clock | `/([0-9]{1,2})点/` | Hour component |
| X:XX | time | `/([0-9]{1,2}):([0-9]{2})/` | Hour:minute |
| 半小时 | half hour | `/半小时/` | Duration 30min |
| 一小时 | one hour | `/一小时/` | Duration 60min |

**Implementation approach:**
- Parse date expressions first to get base date
- Parse time expressions to get hour/minute
- Default end_time = start_time + 1 hour if not specified
- If only date but no time → default to 09:00 (business hours)

### 3.2 Layer 2 — AI Extraction Fallback

Prompt template for Claude:
```
从以下描述中提取日程信息，返回严格 JSON：
{
  "title": "日程标题",
  "start_time": "YYYY-MM-DD HH:mm",
  "end_time": "YYYY-MM-DD HH:mm"
}
规则：
- 如果缺少日期，假设为明天
- 如果缺少时间，假设为上午9点
- 如果缺少结束时间，假设持续1小时
- title 必须简洁，不超过20字
描述："{user_description}"
```

Response is parsed as JSON. If parse fails, fall to Layer 3.

### 3.3 Layer 3 — User Prompt Fallback

If extraction fails or required fields are missing:
```
请提供更详细的日程信息，例如：
/日程 创建 明天下午3点团队周会
```

---

## 4. Schedule Storage (Local Index)

**File:** `{persistenceDir}/schedules.json`

**Schema:**
```typescript
interface ScheduleEntry {
  schedule_id: string;      // WeCom schedule ID
  userid: string;           // Creator/user ID
  summary: string;          // Title
  start_time: number;       // Unix timestamp (seconds)
  end_time: number;         // Unix timestamp (seconds)
  created_at: number;       // Unix timestamp (seconds)
}
```

**Operations:**
- `add(entry)` — append to JSON array
- `listByUser(userid, limit?)` — filter by userid, sort by start_time ascending, return next N
- No deletion/modification for MVP (matches deferred scope)

**Persistence approach:** Same pattern as `ConversationStore` — read in constructor, write after mutations. Simple JSON file, best-effort (errors swallowed).

---

## 5. Test Patterns

From `src/bot/index.test.ts` (existing bot tests):
- Mock `Transport`, `AiBackend`, `WeComApiClient`
- Mock `ConversationStore` methods
- Test command interception flow
- Test fallback to AI chat

From `src/bot/commands/index.test.ts` (new in Phase 9):
- Unit test `parseCommand()` with various inputs
- Mock `apiClient.getDocContent()` and `adapter.chat()`

**New tests needed for Phase 10:**
- `src/bot/commands/schedule.test.ts` — test schedule command parsing and handling
- `src/bot/index.test.ts` — test `/日程` interception in BotOrchestrator
- Regex date parsing tests
- AI extraction fallback tests
- Schedule store persistence tests

---

## 6. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| WeCom schedule API requires specific app permissions | High | Verify the bot app has "日程" (schedule) permission in WeCom admin console. Document in setup guide. |
| No direct "list schedules" API | Medium | Use local index approach (schedules.json). Document limitation. |
| Date parsing edge cases (农历, 节假日) | Low | Layer 2 AI fallback handles ambiguous cases. Layer 3 asks user. |
| Timezone issues | Medium | Store and display in local time. WeCom API expects UTC-ish (Unix timestamp). Use server timezone or config. |
| Rate limiting on schedule API | Low | WeCom API rate limits are generous. Bot already has per-conversation rate limiting. |

---

## 7. Dependencies on Prior Phases

- **Phase 7:** `WeComApiClient.request<T>()` is the foundation for all schedule API calls
- **Phase 9:** Command parsing pattern (`parseCommand`, `handleDocumentCommand`) is the template for schedule commands
- **Phase 9:** Chinese error message pattern (D-05) applies directly
- **Phase 9:** Domain-split command structure (D-02) is the architectural blueprint

---

## RESEARCH COMPLETE
