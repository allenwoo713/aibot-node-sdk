import type { BotConfig } from './config';
import type { Logger } from './types';
import type { PersistenceBackend, ConversationRecord, HistoryMessage } from './persistence';
import { JsonFileBackend } from './persistence/json-file-backend';
import { SqliteBackend } from './persistence/sqlite-backend';

export { HistoryMessage, ConversationRecord } from './persistence';

/**
 * In-memory conversation store with lazy TTL eviction, LRU cap,
 * sliding window truncation, and pluggable persistence backend.
 */
export class ConversationStore {
  private store = new Map<string, ConversationRecord>();
  private config: Pick<
    BotConfig,
    'conversationTtlMs' | 'maxConversations' | 'maxHistoryMessages' | 'persistencePath' | 'persistenceBackend'
  >;
  private logger: Logger | undefined;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private backend: PersistenceBackend;

  constructor(
    config: Pick<BotConfig, 'conversationTtlMs' | 'maxConversations' | 'maxHistoryMessages' | 'persistencePath' | 'persistenceBackend'> & { logger?: Logger },
    backend?: PersistenceBackend,
  ) {
    this.config = config;
    this.logger = config.logger;
    if (backend) {
      this.backend = backend;
    } else if (config.persistenceBackend === 'sqlite') {
      const dbPath = config.persistencePath.replace(/\.json$/, '.db');
      this.backend = new SqliteBackend(dbPath, config.persistencePath, config.conversationTtlMs, this.logger);
    } else {
      this.backend = new JsonFileBackend(config.persistencePath);
    }
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

  /** Load state from persistence backend. */
  private async load(): Promise<void> {
    try {
      const records = await this.backend.load();
      const now = Date.now();
      for (const [id, record] of Object.entries(records)) {
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
    await this.backend.save(obj);
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
    incomingUserMessage?: string,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const history = this.get(conversationId);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];
    if (incomingUserMessage !== undefined) {
      messages.push({ role: 'user', content: incomingUserMessage });
    }
    return messages;
  }

  async close(): Promise<void> {
    // Drain the save queue first
    await this.saveQueue;
    await this.backend.close();
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
