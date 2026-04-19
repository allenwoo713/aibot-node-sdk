import fs from 'fs/promises';
import type { PersistenceBackend, ConversationRecord } from './index';

export class JsonFileBackend implements PersistenceBackend {
  constructor(private path: string) {}

  async load(): Promise<Record<string, ConversationRecord>> {
    try {
      const exists = await fs.access(this.path).then(() => true).catch(() => false);
      if (!exists) return {};
      const raw = await fs.readFile(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ConversationRecord>;
      return parsed;
    } catch {
      return {};
    }
  }

  async save(records: Record<string, ConversationRecord>): Promise<void> {
    const data = JSON.stringify(records);
    if (process.platform !== 'win32') {
      const tmpPath = `${this.path}.tmp`;
      await fs.writeFile(tmpPath, data, 'utf-8');
      await fs.rename(tmpPath, this.path);
    } else {
      await fs.writeFile(this.path, data, 'utf-8');
    }
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}
