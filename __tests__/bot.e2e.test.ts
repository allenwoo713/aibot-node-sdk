import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state.json');

// Mock the SDK before importing the bot
vi.mock('../src', async () => {
  const actual = await vi.importActual('../src');
  return {
    ...actual,
    WSClient: class MockWSClient extends EventEmitter {
      connect = vi.fn();
      disconnect = vi.fn();
      replyStream = vi.fn().mockResolvedValue(undefined);
    },
    generateReqId: vi.fn().mockReturnValue('stream-e2e'),
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

describe('Bot E2E', () => {
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

  it('end-to-end: single chat message gets a reply', async () => {
    chatMock.mockResolvedValueOnce({ content: 'E2E reply' });

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
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
    });

    const frame = createMockFrame();
    (bot as any).wsClient.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    expect(chatMock).toHaveBeenCalledTimes(1);
    const wsClient = (bot as any).wsClient;
    expect(wsClient.replyStream).toHaveBeenCalledWith(
      frame,
      'stream-e2e',
      'E2E reply',
      true,
    );

    bot.stop();
  });

  it('end-to-end: API failure sends fallback', async () => {
    chatMock.mockResolvedValueOnce({ content: 'Fallback text', error: true });

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
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
    });

    const frame = createMockFrame();
    (bot as any).wsClient.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const wsClient = (bot as any).wsClient;
    expect(wsClient.replyStream).toHaveBeenCalledWith(
      frame,
      'stream-e2e',
      'Fallback text',
      true,
    );

    bot.stop();
  });
});
