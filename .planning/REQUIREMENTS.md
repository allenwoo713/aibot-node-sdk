# v1 Requirements

## PERSIST — Async Persistence

- [ ] **PERSIST-01**: `ConversationStore` 的所有磁盘 I/O（读/写）改为异步，不再阻塞 Node.js 事件循环
- [ ] **PERSIST-02**: 引入内部写队列，保证同一时刻只有一个磁盘写入在执行，防止 JSON 文件损坏
- [ ] **PERSIST-03**: 移除构造函数中的同步 `fs.readFileSync`，改为延迟/显式初始化
- [ ] **PERSIST-04**: 保持现有 JSON 文件格式，不破坏已有部署的数据兼容性
- [ ] **PERSIST-05**: 保留 corrupt-state 恢复行为（文件损坏时静默忽略，不崩溃）

## TRANSPORT — HTTP Fallback

- [ ] **TRANS-01**: 新增 WeCom HTTP API 发送消息能力，作为 WebSocket 不可用的 fallback
- [ ] **TRANS-02**: 实现 access_token 的内存缓存与过期自动刷新机制
- [ ] **TRANS-03**: 暴露框架无关的 HTTP callback 处理器（`handleCallback(req, res)`），接收 WeCom 推送的消息/事件
- [ ] **TRANS-04**: HTTP 回调支持 WeCom 的 SHA1 签名验证和时间戳 freshness 检查
- [ ] **TRANS-05**: HTTP 回调支持 AES-256-CBC 解密，并将 payload 标准化为 `WsFrame`，流入现有 `MessageHandler`

## COMPAT — Backward Compatibility

- [ ] **COMPAT-01**: `ConversationStore` 的公开 API 签名保持向后兼容（外部消费者无需修改）
- [ ] **COMPAT-02**: `BotOrchestrator` 内部调用改为 `await` Store 的异步方法
- [ ] **COMPAT-03**: 新增 `Transport` 接口，WebSocket 与 HTTP 统一抽象；`BotOrchestrator` 不感知底层传输

## TEST — Coverage

- [ ] **TEST-01**: 为异步持久化层补充单元测试（并发写入、队列序列化、错误恢复）
- [ ] **TEST-02**: 为 HTTP fallback 补充单元/集成测试（发送、回调验证、解密、重复消息过滤）
- [ ] **TEST-03**: 新增 E2E 测试覆盖 WebSocket + HTTP 混合传输场景

---

## v2 (Deferred)

- Multi-node sync / Redis backend — out of SDK single-process scope
- Token budget / cost guard — high complexity, deferred
- Structured logging / metrics pipeline — unrelated to this milestone

## Out of Scope

- **HTTP media upload fallback** — WeCom HTTP media upload API is complex; this milestone focuses on text message fallback only
- **Automatic transport health detection** — manual/binary fallback first; health detection can be added later if needed
- **Encryption-at-rest for persistence file** — rely on OS-level filesystem permissions

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERSIST-01 | — | pending |
| PERSIST-02 | — | pending |
| PERSIST-03 | — | pending |
| PERSIST-04 | — | pending |
| PERSIST-05 | — | pending |
| TRANS-01 | — | pending |
| TRANS-02 | — | pending |
| TRANS-03 | — | pending |
| TRANS-04 | — | pending |
| TRANS-05 | — | pending |
| COMPAT-01 | — | pending |
| COMPAT-02 | — | pending |
| COMPAT-03 | — | pending |
| TEST-01 | — | pending |
| TEST-02 | — | pending |
| TEST-03 | — | pending |
