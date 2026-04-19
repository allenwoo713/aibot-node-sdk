export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationRecord {
  messages: HistoryMessage[];
  lastAccessedAt: number;
}

export interface PersistenceBackend {
  /** Load all conversation records. Called once during init. */
  load(): Promise<Record<string, ConversationRecord>> | Record<string, ConversationRecord>;
  /** Persist all conversation records. Called after each mutation. */
  save(records: Record<string, ConversationRecord>): Promise<void> | void;
  /** Close any open resources (file handles, DB connections). */
  close(): Promise<void> | void;
}
