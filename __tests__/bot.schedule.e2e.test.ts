import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-schedule-e2e.json');

vi.mock('../src', async () => {
  const actual = await vi.importActual('../src');
  return {
    ...actual,
    generateReqId: vi.fn().mockReturnValue('stream-e2e'),
  };
});

vi.mock('../src/transport', async () => {
  const { EventEmitter } = await vi.importActual('eventemitter3');
  return {
    WsTransport: class MockWsTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
  };
});

const chatMock = vi.fn();
vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = chatMock;
  }),
}));

import { BotOrchestrator } from '../src/bot';
import type { WsFrame, TextMessage } from '../src/types';

function createMockFrame(overrides: Partial<TextMessage> = {}): WsFrame<TextMessage> {
  return {
    headers: { req_id: 'req-e2e' },
    body: {
      msgid: 'm-e2e',
      aibotid: 'bot-e2e',
      chattype: 'single',
      from: { userid: 'user-e2e' },
      msgtype: 'text',
      text: { content: 'E2E hello' },
      ...overrides,
    } as TextMessage,
  };
}

function cleanup() {
  const dbPath = TEST_PERSISTENCE_PATH.replace('.json', '.db');
  for (const p of [TEST_PERSISTENCE_PATH, `${TEST_PERSISTENCE_PATH}.tmp`, dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

describe('Bot E2E — Schedule Command', () => {
  beforeEach(() => {
    chatMock.mockReset();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('end-to-end: /日程 创建 creates a schedule and confirms', async () => {
    const bot = new BotOrchestrator({
      botId: 'bot-e2e',
      secret: 'secret',
      anthropicApiKey: 'key',
      anthropicModel: 'claude-test',
      conversationTtlMs: 60000,
      maxConversations: 100,
      maxHistoryMessages: 10,
      rateLimitRequests: 10,
      rateLimitWindowMs: 60000,
      apiTimeoutMs: 5000,
      maxOutputTokens: 100,
      persistencePath: TEST_PERSISTENCE_PATH,
      persistenceBackend: 'json',
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
      maxInputTokens: 1000,
    });

    (bot as any).apiClient.createSchedule = vi.fn().mockResolvedValue({ errcode: 0, schedule_id: 'sched-e2e' });
    (bot as any).scheduleStore.add = vi.fn().mockResolvedValue(undefined);

    const frame = createMockFrame({ text: { content: '/日程 创建 明天下午3点团队周会' } });
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendStream).toHaveBeenCalled();
    const call = transport.sendStream.mock.calls[0];
    expect(call[2]).toContain('已创建日程');
    expect(call[2]).toContain('团队周会');

    bot.stop();
  });

  it('end-to-end: /日程 列表 returns upcoming schedules', async () => {
    const bot = new BotOrchestrator({
      botId: 'bot-e2e',
      secret: 'secret',
      anthropicApiKey: 'key',
      anthropicModel: 'claude-test',
      conversationTtlMs: 60000,
      maxConversations: 100,
      maxHistoryMessages: 10,
      rateLimitRequests: 10,
      rateLimitWindowMs: 60000,
      apiTimeoutMs: 5000,
      maxOutputTokens: 100,
      persistencePath: TEST_PERSISTENCE_PATH,
      persistenceBackend: 'json',
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
      maxInputTokens: 1000,
    });

    const now = Math.floor(Date.now() / 1000);
    (bot as any).scheduleStore.listUpcoming = vi.fn().mockReturnValue([
      { schedule_id: 's1', summary: '周会', start_time: now + 3600, end_time: now + 7200 },
    ]);

    const frame = createMockFrame({ text: { content: '/日程 列表' } });
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendStream).toHaveBeenCalled();
    const call = transport.sendStream.mock.calls[0];
    expect(call[2]).toContain('周会');

    bot.stop();
  });

  it('end-to-end: /日程 创建 returns failure message on API error', async () => {
    const bot = new BotOrchestrator({
      botId: 'bot-e2e',
      secret: 'secret',
      anthropicApiKey: 'key',
      anthropicModel: 'claude-test',
      conversationTtlMs: 60000,
      maxConversations: 100,
      maxHistoryMessages: 10,
      rateLimitRequests: 10,
      rateLimitWindowMs: 60000,
      apiTimeoutMs: 5000,
      maxOutputTokens: 100,
      persistencePath: TEST_PERSISTENCE_PATH,
      persistenceBackend: 'json',
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
      maxInputTokens: 1000,
    });

    (bot as any).apiClient.createSchedule = vi.fn().mockResolvedValue({ errcode: 40001, errmsg: 'invalid credential' });

    const frame = createMockFrame({ text: { content: '/日程 创建 明天下午3点团队周会' } });
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendStream).toHaveBeenCalled();
    const call = transport.sendStream.mock.calls[0];
    expect(call[2]).toBe('日程创建失败，请稍后重试。');

    bot.stop();
  });
});
