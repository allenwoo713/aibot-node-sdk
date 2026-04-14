import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConversationStore } from './memory';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state.json');

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

  it('lazy init: constructor does not read disk', async () => {
    // Write a persistence file manually
    fs.writeFileSync(TEST_PERSISTENCE_PATH, JSON.stringify({
      c1: { messages: [{ role: 'user', content: 'lazy', timestamp: Date.now() }], lastAccessedAt: Date.now() },
    }), 'utf-8');

    const store = createStore();
    // get is sync and should not trigger load, so it returns empty before init
    expect(store.get('c1')).toEqual([]);

    // append triggers init and load
    await store.append('c1', { role: 'assistant', content: 'loaded' });
    const history = store.get('c1');
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe('lazy');
    expect(history[1].content).toBe('loaded');
  });

  it('write queue: concurrent appends result in valid file', async () => {
    const store = createStore();
    await Promise.all([
      store.append('c1', { role: 'user', content: 'a' }),
      store.append('c1', { role: 'user', content: 'b' }),
      store.append('c1', { role: 'user', content: 'c' }),
    ]);

    const raw = fs.readFileSync(TEST_PERSISTENCE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.c1.messages).toHaveLength(3);
  });

  it('corrupt file: loads gracefully with logger warning', async () => {
    fs.writeFileSync(TEST_PERSISTENCE_PATH, 'not-json', 'utf-8');
    const logger = { warn: vi.fn() };
    const store = createStore(60000, 1000, 20, logger);

    await store.append('c1', { role: 'user', content: 'ok' });
    expect(logger.warn).toHaveBeenCalled();
    expect(store.get('c1')).toHaveLength(1);
  });

  it('logger: I/O errors emit warn log', async () => {
    const logger = { warn: vi.fn() };
    // Create a read-only file so subsequent write fails with EACCES/EPERM
    const roPath = path.resolve(__dirname, '../.test-bot-state-ro.json');
    fs.writeFileSync(roPath, '{}', 'utf-8');
    fs.chmodSync(roPath, 0o444);

    const store = new ConversationStore({
      conversationTtlMs: 60000,
      maxConversations: 1000,
      maxHistoryMessages: 20,
      persistencePath: roPath,
      logger,
    });
    await store.append('c1', { role: 'user', content: 'x' });

    // Restore permissions so afterEach cleanup can remove it
    try { fs.chmodSync(roPath, 0o666); } catch {}
    expect(logger.warn).toHaveBeenCalled();
  });
});
