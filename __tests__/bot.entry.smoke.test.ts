import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state-smoke.json');

vi.mock('../src/config', () => ({
  loadConfig: vi.fn().mockReturnValue({
    botId: 'bot-smoke',
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
    corpId: 'corp-smoke',
    agentId: 'agent-smoke',
  }),
}));

vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () { this.chat = vi.fn(); }),
}));

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
    HttpTransport: class MockHttpTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
    FallbackTransport: class MockFallbackTransport extends EventEmitter {
      connect = vi.fn();
      stop = vi.fn();
      sendText = vi.fn().mockResolvedValue(undefined);
      sendStream = vi.fn().mockResolvedValue(undefined);
      isConnected = vi.fn().mockReturnValue(true);
    },
  };
});

describe('Bot Entry Smoke', () => {
  function cleanupSmokeFiles() {
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
    cleanupSmokeFiles();
  });

  afterEach(() => {
    cleanupSmokeFiles();
  });

  it('loads config and instantiates full stack without throwing', async () => {
    const { bot } = await import('../src/bot/entry');
    expect(bot).toBeDefined();
    expect((bot as any).transport).toBeDefined();
    await bot.stop();
  });
});
