import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-document-e2e.json');

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

describe('Bot E2E — Document Command', () => {
  beforeEach(() => {
    chatMock.mockReset();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('end-to-end: /文档 command downloads and summarizes a document', async () => {
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

    (bot as any).apiClient.getDocContent = vi.fn().mockResolvedValue('# Test Document\nThis is the content.');
    (bot as any).adapter.chat = vi.fn().mockResolvedValue({ content: '文档总结：这是一个测试文档。' });

    const frame = createMockFrame({ text: { content: '/文档 doc_123' } });
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendStream).toHaveBeenCalled();
    const call = transport.sendStream.mock.calls[0];
    expect(call[2]).toContain('文档总结');

    bot.stop();
  });

  it('end-to-end: /文档 command returns timeout error on polling failure', async () => {
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

    (bot as any).apiClient.getDocContent = vi.fn().mockRejectedValue(new Error('Document content polling timed out'));

    const frame = createMockFrame({ text: { content: '/文档 doc_123' } });
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendStream).toHaveBeenCalled();
    const call = transport.sendStream.mock.calls[0];
    expect(call[2]).toBe('文档处理超时，请稍后重试。');

    bot.stop();
  });
});
