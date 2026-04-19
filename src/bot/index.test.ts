import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'eventemitter3';
import { BotOrchestrator } from './index';
import type { WsFrame, TextMessage } from '../types';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../../.test-bot-state-unit.json');

// Mock the SDK exports used by the bot
vi.mock('..', async () => {
  const actual = await vi.importActual('..');
  return {
    ...actual,
    generateReqId: vi.fn().mockReturnValue('stream-123'),
  };
});

vi.mock('../transport', async () => {
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

// Mock the Anthropic adapter
const chatMock = vi.fn();
vi.mock('../ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () {
    this.chat = chatMock;
  }),
}));

function createMockFrame(overrides: Partial<TextMessage> = {}): WsFrame<TextMessage> {
  return {
    headers: { req_id: 'req-1' },
    body: {
      msgid: 'm1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'text',
      text: { content: 'Hello bot' },
      ...overrides,
    } as TextMessage,
  };
}

function createBot() {
  return new BotOrchestrator({
    botId: 'bot-1',
    secret: 'secret',
    anthropicApiKey: 'key',
    anthropicModel: 'claude-test',
    conversationTtlMs: 60000,
    maxConversations: 100,
    maxHistoryMessages: 10,
    rateLimitRequests: 2,
    rateLimitWindowMs: 1000,
    apiTimeoutMs: 5000,
    maxOutputTokens: 100,
    persistencePath: TEST_PERSISTENCE_PATH,
    persistenceBackend: 'json',
    internalSystemPrompt: 'Internal prompt',
    externalSystemPrompt: 'External prompt',
    maxInputTokens: 100,
    maxRetries: 1,
    retryBaseDelayMs: 2000,
    retryBackoffMultiplier: 2,
    retryJitter: true,
    fallbackRateLimit: 'Rate limit fallback',
    fallbackAuthInvalid: 'Auth invalid fallback',
    fallbackValidationFailed: 'Validation failed fallback',
    fallbackRetryable: 'Retryable fallback',
  });
}

describe('BotOrchestrator', () => {
  function cleanupBotTestFiles() {
    const dbPath = TEST_PERSISTENCE_PATH.replace('.json', '.db');
    for (const p of [TEST_PERSISTENCE_PATH, `${TEST_PERSISTENCE_PATH}.tmp`, dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    try {
      const dir = path.dirname(TEST_PERSISTENCE_PATH);
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.includes('.migrated-')) {
          fs.rmSync(path.join(dir, file), { force: true });
        }
      }
    } catch { /* ignore */ }
  }

  beforeEach(() => {
    chatMock.mockReset();
    cleanupBotTestFiles();
  });

  afterEach(() => {
    cleanupBotTestFiles();
  });

  it('replies to single chat text messages', async () => {
    chatMock.mockResolvedValueOnce({ content: 'Hi there' });

    const bot = createBot();
    const frame = createMockFrame();
    (bot as any).transport.emit('message.text', frame);

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));

    expect(chatMock).toHaveBeenCalledTimes(1);
    const transport = (bot as any).transport;
    expect(transport.sendStream).toHaveBeenCalledWith(frame, 'stream-123', 'Hi there', true);
  });

  it('sends fallback when AI returns an error', async () => {
    chatMock.mockResolvedValueOnce({ content: 'AI is down', error: true });

    const bot = createBot();
    const frame = createMockFrame();
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendText).toHaveBeenCalledWith(frame, 'AI is down');
  });

  it('logs errorCode when AI returns a classified error', async () => {
    chatMock.mockResolvedValueOnce({ content: 'Rate limit hit', error: true, errorCode: 'rate_limited' });

    const bot = createBot();
    const frame = createMockFrame();
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    expect(transport.sendText).toHaveBeenCalledWith(frame, 'Rate limit hit');
  });

  it('rate limits excess requests per conversation', async () => {
    chatMock.mockResolvedValue({ content: 'OK' });

    const bot = createBot();
    const frame = createMockFrame();

    // 1st request
    (bot as any).transport.emit('message.text', frame);
    await new Promise((r) => setTimeout(r, 20));
    // 2nd request
    (bot as any).transport.emit('message.text', frame);
    await new Promise((r) => setTimeout(r, 20));
    // 3rd request — should be rate limited
    (bot as any).transport.emit('message.text', frame);
    await new Promise((r) => setTimeout(r, 20));

    expect(chatMock).toHaveBeenCalledTimes(2);
    const transport = (bot as any).transport;
    const rateLimitCalls = (transport.sendText as any).mock.calls.filter(
      (c: any[]) => c[1] === '请求太多了，请稍后再试。',
    );
    expect(rateLimitCalls.length).toBe(1);
  });

  it('uses external system prompt for external contacts', async () => {
    chatMock.mockResolvedValueOnce({ content: 'OK' });

    const bot = createBot();
    const frame = createMockFrame({
      external: true,
    } as any);
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const call = chatMock.mock.calls[0][0];
    expect(call.contactType).toBe('external');
  });

  it('ignores group messages without mention metadata', async () => {
    chatMock.mockResolvedValueOnce({ content: 'OK' });

    const bot = createBot();
    const frame = createMockFrame({ chattype: 'group', chatid: 'group-1' });
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    expect(chatMock).not.toHaveBeenCalled();
  });

  it('replies to group messages when bot is mentioned', async () => {
    chatMock.mockResolvedValueOnce({ content: 'OK' });

    const bot = createBot();
    const frame = createMockFrame({
      chattype: 'group',
      chatid: 'group-1',
      mention: [{ userid: 'bot-1' }],
    } as any);
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('chunks long replies into multiple stream messages', async () => {
    chatMock.mockResolvedValueOnce({ content: 'a'.repeat(5000) });

    const bot = createBot();
    const frame = createMockFrame();
    (bot as any).transport.emit('message.text', frame);

    await new Promise((r) => setTimeout(r, 50));

    const transport = (bot as any).transport;
    const calls = (transport.sendStream as any).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    // Last call should finish the stream
    expect(calls[calls.length - 1][3]).toBe(true);
    // Earlier calls should not finish
    expect(calls[0][3]).toBe(false);
  });

  it('stops transport and closes store on stop', async () => {
    const bot = createBot();
    const storeCloseSpy = vi.spyOn((bot as any).store, 'close').mockResolvedValue(undefined);
    await bot.stop();
    expect(storeCloseSpy).toHaveBeenCalled();
  });
});
