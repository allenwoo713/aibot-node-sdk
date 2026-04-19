import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { PersistenceBackend, ConversationRecord } from './index';
import type { Logger } from '../types';

export class SqliteBackend implements PersistenceBackend {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private selectAllStmt: Database.Statement;
  private deleteAllStmt: Database.Statement;
  private countStmt: Database.Statement;

  constructor(
    private dbPath: string,
    private jsonPath: string | undefined,
    private conversationTtlMs: number,
    private logger?: Logger,
  ) {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT PRIMARY KEY,
        messages TEXT NOT NULL,
        last_accessed_at INTEGER NOT NULL
      )
    `);

    this.insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO conversations (conversation_id, messages, last_accessed_at) VALUES (?, ?, ?)',
    );
    this.selectAllStmt = this.db.prepare(
      'SELECT conversation_id, messages, last_accessed_at FROM conversations',
    );
    this.deleteAllStmt = this.db.prepare('DELETE FROM conversations');
    this.countStmt = this.db.prepare('SELECT COUNT(*) as count FROM conversations');

    this.migrateFromJson();
  }

  load(): Record<string, ConversationRecord> {
    try {
      const rows = this.selectAllStmt.all() as Array<{
        conversation_id: string;
        messages: string;
        last_accessed_at: number;
      }>;
      const result: Record<string, ConversationRecord> = {};
      for (const row of rows) {
        result[row.conversation_id] = {
          messages: JSON.parse(row.messages),
          lastAccessedAt: row.last_accessed_at,
        };
      }
      return result;
    } catch (err) {
      this.logger?.warn('Failed to load from SQLite, starting fresh.', err);
      return {};
    }
  }

  save(records: Record<string, ConversationRecord>): void {
    try {
      const transaction = this.db.transaction(() => {
        this.deleteAllStmt.run();
        for (const [id, record] of Object.entries(records)) {
          this.insertStmt.run(id, JSON.stringify(record.messages), record.lastAccessedAt);
        }
      });
      transaction();
    } catch (err) {
      this.logger?.warn('Failed to save to SQLite.', err);
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch (err) {
      this.logger?.warn('Failed to close SQLite database.', err);
    }
  }

  getDbPath(): string {
    return this.dbPath;
  }

  private migrateFromJson(): void {
    if (!this.jsonPath || !fs.existsSync(this.jsonPath)) {
      return;
    }

    try {
      const count = (this.countStmt.get() as { count: number }).count;
      if (count > 0) {
        return;
      }

      const raw = fs.readFileSync(this.jsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ConversationRecord>;
      const now = Date.now();
      const filtered: Record<string, ConversationRecord> = {};

      for (const [id, record] of Object.entries(parsed)) {
        if (now - record.lastAccessedAt < this.conversationTtlMs) {
          filtered[id] = record;
        }
      }

      if (Object.keys(filtered).length > 0) {
        const transaction = this.db.transaction(() => {
          for (const [id, record] of Object.entries(filtered)) {
            this.insertStmt.run(id, JSON.stringify(record.messages), record.lastAccessedAt);
          }
        });
        transaction();
      }

      const date = new Date();
      const ts = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
      fs.renameSync(this.jsonPath, `${this.jsonPath}.migrated-${ts}`);
    } catch (err) {
      this.logger?.warn('Failed to migrate from JSON, leaving original file untouched.', err);
    }
  }
}
