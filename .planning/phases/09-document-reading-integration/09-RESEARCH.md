# Phase 9: Document Reading Integration — Research

**Researched:** 2026-04-22
**Status:** Complete

---

## Research Findings

### WeCom Micro-Document API

WeCom provides two distinct document systems:
1. **微盘 (Wedrive)** — File storage with `file_id`-based access
2. **文档 (Doc)** — Native document editor with `docid`-based access

For Phase 9's "micro-document reading" use case, the relevant API is the **Doc API** (`get_doc_content`), not Wedrive.

#### `get_doc_content` — Retrieve Document Content

- **Endpoint**: `POST /doc/get_doc_content`
- **Authentication**: Requires `access_token` (handled by existing `WeComApiClient`)
- **Parameters**:
  - `docid` (string, optional) — Document unique ID. Mutually exclusive with `url`.
  - `url` (string, optional) — Document access URL. Mutually exclusive with `docid`.
  - `type` (integer, required) — Content format. Fixed value `2` for Markdown.
  - `task_id` (string, optional) — Polling task ID. Omit on first call; include for subsequent polling.

- **Response**:
  - `errcode` / `errmsg` — Standard WeCom error envelope
  - `task_id` — Task ID for polling
  - `task_done` — `false` while processing, `true` when complete
  - `content` — Full document content in **Markdown format** (only present when `task_done` is `true`)

- **Async Polling Pattern**:
  ```
  1. First call: { docid: "xxx", type: 2 }
     → Returns { task_id: "xxx", task_done: false }
  2. Poll: { docid: "xxx", type: 2, task_id: "xxx" }
     → Repeat until task_done: true
  3. Complete: { task_done: true, content: "# Title\n..." }
  ```

#### Document Identification (`docid`)

- `docid` is **only returned at document creation time** (`create_doc` API).
- There is **no WeCom Open Platform API to search or list documents by name**.
- Documents cannot be looked up by title through the API.

**Implication for Phase 9:** The CONTEXT.md decision D-03 ("substring match against document titles") is **not implementable** via the Open Platform API alone. The bot must receive a `docid` (or full `url`) from the user, not a human-readable name.

#### Workaround Options

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A — Require `docid` | User passes `/文档 <docid>` | Accurate but user-unfriendly |
| B — Require `url` | User passes `/文档 <url>` | Slightly better UX; `url` is shareable from WeCom UI |
| C — DocID mapping | Bot maintains a local name→docid mapping | Requires manual/admin setup; not self-service |
| D — Re-scope command | `/文档` without args replies with usage + instructions | Best fallback; educates users |

**Recommendation:** Combine B + D. Accept `docid` or `url` as the argument. If missing/invalid, reply with instructions on how to obtain the document URL from WeCom.

---

### Document Content Format

- **Format**: Markdown (`type: 2`)
- **Structure**: Standard Markdown with headings, lists, tables, code blocks
- **Size**: Unbounded; large documents may require multiple polling iterations
- **Encoding**: UTF-8

**Implication**: The bot can pass Markdown directly to Claude for summarization without parsing or conversion.

---

### Integration Patterns

#### 1. API Client Extension

The existing `WeComApiClient` (`src/api.ts`) uses a generic `request<T>()` method. Two integration approaches:

**Option A — Inline `request<T>` calls:**
```typescript
const pollResult = await apiClient.request<GetDocContentResponse>({
  method: 'POST',
  url: '/doc/get_doc_content',
  body: { docid, type: 2 }
});
```

**Option B — Typed wrapper method:**
```typescript
class WeComApiClient {
  async getDocContent(docid: string): Promise<string> {
    // handles polling internally
  }
}
```

**Recommendation**: Option B — encapsulate polling logic inside `WeComApiClient` to keep bot layer clean. This aligns with Phase 7's pattern of typed API wrappers.

#### 2. Command Router Integration

The command router (`src/bot/commands/`) should:
1. Detect `/文档` prefix
2. Extract argument (docid or url)
3. Validate argument format (docid regex or URL parse)
4. Call `WeComApiClient.getDocContent()`
5. Handle polling loop (with timeout)
6. Build summarization prompt
7. Call `AiBackend.chat()`
8. Stream reply to user

#### 3. Polling Implementation

```typescript
async function getDocContentWithPoll(
  client: WeComApiClient,
  docid: string,
  options: { maxPolls?: number; pollIntervalMs?: number } = {}
): Promise<string> {
  const { maxPolls = 10, pollIntervalMs = 1000 } = options;
  let taskId: string | undefined;

  for (let i = 0; i < maxPolls; i++) {
    const resp = await client.request<GetDocContentResponse>({
      method: 'POST',
      url: '/doc/get_doc_content',
      body: taskId ? { docid, type: 2, task_id: taskId } : { docid, type: 2 }
    });

    if (resp.task_done) return resp.content;
    taskId = resp.task_id;
    await sleep(pollIntervalMs);
  }

  throw new Error('Document content polling timed out');
}
```

---

### Claude Summarization Strategy

#### Prompt Engineering

```
请用中文总结以下文档的主要内容，列出关键要点：

{document_markdown}
```

#### Context Window Considerations

- Claude 3.5 Sonnet: ~200K tokens
- Document content could exceed this for very large docs
- **Strategy**: If content exceeds `maxInputTokens`, truncate with a warning note in the summary
- **Token estimation**: Roughly 1 token ≈ 0.75 English chars, 1 token ≈ 0.5 Chinese chars
- **Implementation**: Count chars, estimate tokens, truncate if needed before sending to `AiBackend.chat()`

#### One-Shot vs. Memory

- **One-shot** (selected per CONTEXT.md D-04): Document content is passed as a single user message with a system prompt; not appended to `ConversationStore`
- **Rationale**: Prevents LRU cache bloat; keeps follow-up questions in normal chat mode

---

### Risks and Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| No name-based document lookup | **High** | Accept docid/url instead; provide clear usage instructions |
| Async polling adds latency | Medium | Cap polls (e.g., 10 × 1s = 10s max); return "处理中" message if exceeded |
| Large documents exceed token limit | Medium | Pre-flight token estimation + truncation with warning |
| Invalid docid format | Low | Regex validation before API call; clear error message |
| WeCom API rate limits on doc API | Low | Reuse existing rate limiter; add doc-specific backoff if observed |
| Document URL parsing edge cases | Low | Validate URL hostname (`doc.weixin.qq.com`); fallback to treating as docid |

---

## Validation Architecture

### Critical Failure Modes

1. **Polling never completes** — `task_done` stays `false` beyond `maxPolls`
2. **Empty document content** — `content` is empty string or whitespace
3. **Token limit exceeded** — Document too large for Claude context window
4. **Invalid docid/url** — User provides malformed input
5. **API permission denied** — Bot's app lacks document read scope

### Eval Dimensions

| Dimension | How to Verify |
|-----------|---------------|
| **Functional** | Unit test: command parser extracts docid/url correctly |
| **Functional** | Integration test: mocked `get_doc_content` polling returns expected content |
| **Functional** | Integration test: summarization prompt produces non-empty summary |
| **Error Handling** | Unit test: invalid docid → specific error message |
| **Error Handling** | Unit test: polling timeout → timeout error message |
| **Performance** | Max polling time < 15 seconds |
| **Security** | No docid/url logged at `info` level; sanitize before logging |

---

*Phase: 09-document-reading-integration*
*Research completed: 2026-04-22*
