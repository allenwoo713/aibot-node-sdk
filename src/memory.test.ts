import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { ConversationStore } from './memory';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state.json');

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createStore(ttlMs = 60000, maxConversations = 1000, maxHistory = 20, logger?: any) {
  return new ConversationStore({
    conversationTtlMs: ttlMs,
    maxConversations,
    maxHistoryMessages: maxHistory,
    persistencePath: TEST_PERSISTENCE_PATH,
    logger,
  });
}

describe('ConversationStore', () => {
  beforeEach(() => {
    try {
      if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
        fs.rmSync(TEST_PERSISTENCE_PATH, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
        fs.rmSync(TEST_PERSISTENCE_PATH, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  it('returns empty history for unknown conversation', () => {
    const store = createStore();
    expect(store.get('unknown')).toEqual([]);
  });

  it('appends and retrieves messages', async () => {
    const store = createStore();
    await store.append('c1', { role: 'user', content: 'hello' });
    await store.append('c1', { role: 'assistant', content: 'hi' });

    const history = store.get('c1');
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  it('evicts expired conversations lazily on get', async () => {
    const store = createStore(10); // 10ms TTL
    await store.append('c1', { role: 'user', content: 'hello' });
    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.get('c1')).toEqual([]);
  });

  it('enforces maxHistoryMessages sliding window', async () => {
    const store = createStore(60000, 1000, 3);
    await store.append('c1', { role: 'user', content: '1' });
    await store.append('c1', { role: 'assistant', content: '2' });
    await store.append('c1', { role: 'user', content: '3' });
    await store.append('c1', { role: 'assistant', content: '4' });

    const history = store.get('c1');
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('2');
    expect(history[2].content).toBe('4');
  });

  it('evicts LRU when maxConversations exceeded', async () => {
    const store = createStore(60000, 2, 20);
    await store.append('c1', { role: 'user', content: 'a' });
    await store.append('c2', { role: 'user', content: 'b' });
    // Access c1 to keep it fresh
    store.get('c1');
    await store.append('c3', { role: 'user', content: 'c' });

    expect(store.get('c1')).toHaveLength(1);
    expect(store.get('c2')).toEqual([]); // evicted
    expect(store.get('c3')).toHaveLength(1);
  });

  it('persists and restores state across instances', async () => {
    const store1 = createStore();
    await store1.append('c1', { role: 'user', content: 'persist' });

    const store2 = createStore();
    await store2.append('c2', { role: 'user', content: 'trigger-init' });
    const history = store2.get('c1');
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('persist');
  });

  it('buildMessages injects system prompt and latest user message', async () => {
    const store = createStore();
    await store.append('c1', { role: 'user', content: 'hello' });
    await store.append('c1', { role: 'assistant', content: 'hi' });

    const messages = store.buildMessages('c1', 'You are helpful.', 'new question');
    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hello' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'hi' });
    expect(messages[3]).toEqual({ role: 'user', content: 'new question' });
  });

  it('clear removes a conversation', async () => {
    const store = createStore();
    await store.append('c1', { role: 'user', content: 'a' });
    await store.clear('c1');
    expect(store.get('c1')).toEqual([]);
  });

  describe('async persistence', () => {
    it('lazy initializes on first mutation', async () => {
      fs.writeFileSync(
        TEST_PERSISTENCE_PATH,
        JSON.stringify({
          c1: {
            messages: [{ role: 'user', content: 'lazy', timestamp: Date.now() }],
            lastAccessedAt: Date.now(),
          },
        }),
        'utf-8',
      );

      const readFileSpy = vi.spyOn(fsPromises, 'readFile');

      const store = createStore();
      // Constructor should not trigger readFile
      expect(readFileSpy).not.toHaveBeenCalled();

      // get is sync and should not trigger load either
      expect(store.get('c1')).toEqual([]);
      expect(readFileSpy).not.toHaveBeenCalled();

      // append triggers init and load
      await store.append('c1', { role: 'assistant', content: 'loaded' });
      expect(readFileSpy).toHaveBeenCalledTimes(1);
      expect(readFileSpy).toHaveBeenCalledWith(TEST_PERSISTENCE_PATH, 'utf-8');

      const history = store.get('c1');
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('lazy');
      expect(history[1].content).toBe('loaded');
    });

    it('serializes concurrent writes', async () => {
      const store = createStore();

      let inFlight = 0;
      let maxInFlight = 0;

      const writeFileSpy = vi.spyOn(fsPromises, 'writeFile').mockImplementation(async (filePath, data, encoding) => {
        inFlight += 1;
        if (inFlight > maxInFlight) {
          maxInFlight = inFlight;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        // Use sync write to avoid recursive mock invocation
        fs.writeFileSync(filePath as string, data as string, encoding as fs.WriteFileOptions);
        inFlight -= 1;
      });

      await Promise.all([
        store.append('c1', { role: 'user', content: 'a' }),
        store.append('c1', { role: 'user', content: 'b' }),
        store.append('c1', { role: 'user', content: 'c' }),
        store.append('c1', { role: 'user', content: 'd' }),
        store.append('c1', { role: 'user', content: 'e' }),
      ]);

      // Because the queue chains saves, only one write should be in flight at a time
      expect(maxInFlight).toBe(1);

      const raw = fs.readFileSync(TEST_PERSISTENCE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.c1.messages).toHaveLength(5);
      expect(parsed.c1.messages.map((m: any) => m.content)).toEqual(['a', 'b', 'c', 'd', 'e']);

      writeFileSpy.mockRestore();
    });

    it('recovers from corrupt persistence file and logs warning', async () => {
      fs.writeFileSync(TEST_PERSISTENCE_PATH, '{"broken"', 'utf-8');
      const logger = createMockLogger();
      const store = createStore(60000, 1000, 20, logger);

      await store.append('c1', { role: 'user', content: 'hello' });

      expect(logger.warn).toHaveBeenCalled();
      const warnCall = logger.warn.mock.calls.find((call) =>
        typeof call[0] === 'string' && call[0].includes('load conversation state'),
      );
      expect(warnCall).toBeTruthy();

      expect(store.get('c1')).toHaveLength(1);
      expect(store.get('c1')[0].content).toBe('hello');
    });

    it('logs warning on save failure without throwing', async () => {
      const logger = createMockLogger();
      const store = createStore(60000, 1000, 20, logger);

      vi.spyOn(fsPromises, 'writeFile').mockRejectedValue(new Error('disk full'));

      await expect(store.append('c1', { role: 'user', content: 'hello' })).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalled();
      const warnCall = logger.warn.mock.calls.find((call) =>
        typeof call[0] === 'string' && call[0].includes('save conversation state'),
      );
      expect(warnCall).toBeTruthy();
    });
  });
});
