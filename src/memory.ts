import fs from 'fs';
import type { BotConfig } from './config';

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

  constructor(config: Pick<BotConfig, 'conversationTtlMs' | 'maxConversations' | 'maxHistoryMessages' | 'persistencePath'>) {
    this.config = config;
    this.load();
  }

  /** Load state from disk if the file exists. */
  private load(): void {
    try {
      if (!fs.existsSync(this.config.persistencePath)) return;
      const raw = fs.readFileSync(this.config.persistencePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ConversationRecord>;
      const now = Date.now();
      for (const [id, record] of Object.entries(parsed)) {
        if (now - record.lastAccessedAt < this.config.conversationTtlMs) {
          this.store.set(id, record);
        }
      }
    } catch {
      // Ignore corrupt or unreadable state files — start fresh.
    }
  }

  /** Persist state to disk. */
  save(): void {
    try {
      const obj = Object.fromEntries(this.store.entries());
      fs.writeFileSync(this.config.persistencePath, JSON.stringify(obj), 'utf-8');
    } catch {
      // Best-effort persistence.
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
  append(conversationId: string, message: Omit<HistoryMessage, 'timestamp'>): void {
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

    this.save();
  }

  /** Clear a specific conversation. */
  clear(conversationId: string): void {
    this.store.delete(conversationId);
    this.save();
  }

  /** Clear all conversations. */
  clearAll(): void {
    this.store.clear();
    this.save();
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
