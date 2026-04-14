import fs from 'fs/promises';
import path from 'path';
import type { BotConfig } from './config';
import type { Logger } from './types';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ConversationRecord {
  messages: HistoryMessage[];
  lastAccessedAt: number;
}

/**
 * In-memory conversation store with lazy TTL eviction, LRU cap,
 * sliding window truncation, and JSON-file persistence.
 */
export class ConversationStore {
  private store = new Map<string, ConversationRecord>();
  private config: Pick<
    BotConfig,
    'conversationTtlMs' | 'maxConversations' | 'maxHistoryMessages' | 'persistencePath'
  >;
  private logger: Logger | undefined;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(config: Pick<BotConfig, 'conversationTtlMs' | 'maxConversations' | 'maxHistoryMessages' | 'persistencePath'> & { logger?: Logger }) {
    this.config = config;
    this.logger = config.logger;
  }

  /** Initialize once by loading state from disk. */
  private init(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve();
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.load().then(() => {
      this.initialized = true;
    });
    return this.initPromise;
  }

  /** Load state from disk if the file exists. */
  private async load(): Promise<void> {
    try {
      const exists = await fs.access(this.config.persistencePath).then(() => true).catch(() => false);
      if (!exists) return;
      const raw = await fs.readFile(this.config.persistencePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ConversationRecord>;
      const now = Date.now();
      for (const [id, record] of Object.entries(parsed)) {
        if (now - record.lastAccessedAt < this.config.conversationTtlMs) {
          this.store.set(id, record);
        }
      }
    } catch (err) {
      this.logger?.warn('Failed to load conversation state, starting fresh.', err);
    }
  }

  /** Persist state to disk. */
  save(): Promise<void> {
    this.saveQueue = this.saveQueue.then(() => this.doSave()).catch((err) => {
      this.logger?.warn('Failed to save conversation state.', err);
    });
    return this.saveQueue;
  }

  private async doSave(): Promise<void> {
    const obj = Object.fromEntries(this.store.entries());
    const data = JSON.stringify(obj);
    if (process.platform !== 'win32') {
      const tmpPath = `${this.config.persistencePath}.tmp`;
      await fs.writeFile(tmpPath, data, 'utf-8');
      await fs.rename(tmpPath, this.config.persistencePath);
    } else {
      await fs.writeFile(this.config.persistencePath, data, 'utf-8');
    }
  }

  /** Get conversation history (without system prompt). */
  get(conversationId: string): HistoryMessage[] {
    this.evictIfExpired(conversationId);
    const record = this.store.get(conversationId);
    if (!record) return [];
    record.lastAccessedAt = Date.now();
    return record.messages;
  }

  /** Append a message to a conversation. */
  async append(conversationId: string, message: Omit<HistoryMessage, 'timestamp'>): Promise<void> {
    await this.init();
    this.evictIfExpired(conversationId);

    let record = this.store.get(conversationId);
    if (!record) {
      // If we're at capacity, evict the least-recently-used conversation first.
      if (this.store.size >= this.config.maxConversations) {
        this.evictLru();
      }
      record = { messages: [], lastAccessedAt: Date.now() };
      this.store.set(conversationId, record);
    }

    record.lastAccessedAt = Date.now();
    record.messages.push({ ...message, timestamp: Date.now() });

    // Enforce sliding window.
    if (record.messages.length > this.config.maxHistoryMessages) {
      record.messages = record.messages.slice(-this.config.maxHistoryMessages);
    }

    await this.save();
  }

  /** Clear a specific conversation. */
  async clear(conversationId: string): Promise<void> {
    await this.init();
    this.store.delete(conversationId);
    await this.save();
  }

  /** Clear all conversations. */
  async clearAll(): Promise<void> {
    await this.init();
    this.store.clear();
    await this.save();
  }

  /** Build full message list including the system prompt at the front. */
  buildMessages(
    conversationId: string,
    systemPrompt: string,
    incomingUserMessage: string,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const history = this.get(conversationId);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: incomingUserMessage },
    ];
    return messages;
  }

  private evictIfExpired(conversationId: string): void {
    const record = this.store.get(conversationId);
    if (!record) return;
    if (Date.now() - record.lastAccessedAt >= this.config.conversationTtlMs) {
      this.store.delete(conversationId);
    }
  }

  private evictLru(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, record] of this.store.entries()) {
      if (record.lastAccessedAt <= oldestTime) {
        oldestTime = record.lastAccessedAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      this.store.delete(oldestId);
    }
  }
}
