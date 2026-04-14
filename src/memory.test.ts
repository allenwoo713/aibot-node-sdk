import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ConversationStore } from './memory';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state.json');

function createStore(ttlMs = 60000, maxConversations = 1000, maxHistory = 20) {
  return new ConversationStore({
    conversationTtlMs: ttlMs,
    maxConversations,
    maxHistoryMessages: maxHistory,
    persistencePath: TEST_PERSISTENCE_PATH,
  });
}

describe('ConversationStore', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  it('returns empty history for unknown conversation', () => {
    const store = createStore();
    expect(store.get('unknown')).toEqual([]);
  });

  it('appends and retrieves messages', () => {
    const store = createStore();
    store.append('c1', { role: 'user', content: 'hello' });
    store.append('c1', { role: 'assistant', content: 'hi' });

    const history = store.get('c1');
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  it('evicts expired conversations lazily on get', () => {
    const store = createStore(10); // 10ms TTL
    store.append('c1', { role: 'user', content: 'hello' });
    // Wait for TTL to expire
    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      expect(store.get('c1')).toEqual([]);
    });
  });

  it('enforces maxHistoryMessages sliding window', () => {
    const store = createStore(60000, 1000, 3);
    store.append('c1', { role: 'user', content: '1' });
    store.append('c1', { role: 'assistant', content: '2' });
    store.append('c1', { role: 'user', content: '3' });
    store.append('c1', { role: 'assistant', content: '4' });

    const history = store.get('c1');
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe('2');
    expect(history[2].content).toBe('4');
  });

  it('evicts LRU when maxConversations exceeded', () => {
    const store = createStore(60000, 2, 20);
    store.append('c1', { role: 'user', content: 'a' });
    store.append('c2', { role: 'user', content: 'b' });
    // Access c1 to keep it fresh
    store.get('c1');
    store.append('c3', { role: 'user', content: 'c' });

    expect(store.get('c1')).toHaveLength(1);
    expect(store.get('c2')).toEqual([]); // evicted
    expect(store.get('c3')).toHaveLength(1);
  });

  it('persists and restores state across instances', () => {
    const store1 = createStore();
    store1.append('c1', { role: 'user', content: 'persist' });

    const store2 = createStore();
    const history = store2.get('c1');
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('persist');
  });

  it('buildMessages injects system prompt and latest user message', () => {
    const store = createStore();
    store.append('c1', { role: 'user', content: 'hello' });
    store.append('c1', { role: 'assistant', content: 'hi' });

    const messages = store.buildMessages('c1', 'You are helpful.', 'new question');
    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hello' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'hi' });
    expect(messages[3]).toEqual({ role: 'user', content: 'new question' });
  });

  it('clear removes a conversation', () => {
    const store = createStore();
    store.append('c1', { role: 'user', content: 'a' });
    store.clear('c1');
    expect(store.get('c1')).toEqual([]);
  });
});
