import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state-fallback.json');

vi.mock('../src', async () => {
  const actual = await vi.importActual('../src');
  return {
    ...actual,
    WSClient: class MockWSClient extends EventEmitter {
      connect = vi.fn();
      disconnect = vi.fn();
      replyStream = vi.fn().mockResolvedValue(undefined);
    },
    generateReqId: vi.fn().mockReturnValue('stream-fallback'),
  };
});

vi.mock('../src/client', () => ({
  WSClient: class MockWSClient extends EventEmitter {
    connect = vi.fn();
    disconnect = vi.fn();
    replyStream = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../src/utils', () => ({
  generateReqId: vi.fn().mockReturnValue('stream-fallback'),
}));

const chatMock = vi.fn();
vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = chatMock;
  }),
}));

vi.mock('../src/api', () => ({
  WeComApiClient: vi.fn().mockImplementation(function () {
    this.getAccessToken = vi.fn().mockResolvedValue({ access_token: 'tok-fb', expires_in: 7200 });
    this.sendTextMessage = vi.fn().mockResolvedValue(undefined);
    this.downloadFileRaw = vi.fn();
  }),
}));

import { BotOrchestrator } from '../src/bot';
import { WsTransport, HttpTransport, FallbackTransport } from '../src/transport';
import type { WsFrame, TextMessage } from '../src/types';

function createMockFrame(overrides: Partial<TextMessage> = {}): WsFrame<TextMessage> {
  return {
    headers: { req_id: 'req-fb' },
    body: {
      msgid: 'm-fb',
      aibotid: 'bot-fb',
      chattype: 'single',
      from: { userid: 'user-fb' },
      msgtype: 'text',
      text: { content: 'Fallback hello' },
      ...overrides,
    } as TextMessage,
  };
}

describe('Bot Fallback E2E', () => {
  beforeEach(() => {
    chatMock.mockReset();
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  it('end-to-end: fallback transport switches reply routing after disconnect', async () => {
    chatMock
      .mockResolvedValueOnce({ content: 'WS reply' })
      .mockResolvedValueOnce({ content: 'HTTP reply' });

    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const wsTransport = new WsTransport({ botId: 'bot-fb', secret: 'secret' });
    const httpTransport = new HttpTransport({
      botId: 'bot-fb',
      secret: 'secret',
      corpId: 'corp-fb',
      agentId: 'agent-fb',
      logger,
    });
    const fallbackTransport = new FallbackTransport(wsTransport, httpTransport, logger);

    const bot = new BotOrchestrator({
      botId: 'bot-fb',
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
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
    }, fallbackTransport);

    // Primary connected
    (wsTransport as any).emit('connected');

    const frame1 = createMockFrame({ msgid: 'm-fb-1', text: { content: 'Hello WS' } });
    (bot as any).transport.emit('message.text', frame1);
    await new Promise((r) => setTimeout(r, 50));

    expect((wsTransport as any).wsClient.replyStream).toHaveBeenCalledWith(
      frame1,
      'stream-fallback',
      'WS reply',
      true,
    );

    // Primary disconnected
    (wsTransport as any).emit('disconnected', 'network error');

    const frame2 = createMockFrame({ msgid: 'm-fb-2', text: { content: 'Hello HTTP' } });
    (bot as any).transport.emit('message.text', frame2);
    await new Promise((r) => setTimeout(r, 50));

    expect((httpTransport as any).apiClient.sendTextMessage).toHaveBeenCalledWith(
      'agent-fb',
      'user-fb',
      undefined,
      'HTTP reply',
    );

    bot.stop();
  });
});
