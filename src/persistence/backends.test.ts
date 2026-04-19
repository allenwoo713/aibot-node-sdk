import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JsonFileBackend } from './json-file-backend';
import { SqliteBackend } from './sqlite-backend';
import type { PersistenceBackend, ConversationRecord } from './index';

const TEST_DIR = path.resolve(__dirname, '../../.test-persistence');

interface BackendFixture {
  name: string;
  create: () => PersistenceBackend;
  cleanup: () => void;
}

function createFixtures(): BackendFixture[] {
  const jsonPath = path.join(TEST_DIR, 'state.json');
  const dbPath = path.join(TEST_DIR, 'state.db');

  return [
    {
      name: 'JsonFileBackend',
      create: () => new JsonFileBackend(jsonPath),
      cleanup: () => {
        try {
          if (fs.existsSync(jsonPath)) fs.rmSync(jsonPath, { force: true });
          if (fs.existsSync(`${jsonPath}.tmp`)) fs.rmSync(`${jsonPath}.tmp`, { force: true });
        } catch { /* ignore */ }
      },
    },
    {
      name: 'SqliteBackend',
      create: () => new SqliteBackend(dbPath, undefined, 60000),
      cleanup: () => {
        try {
          if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
          if (fs.existsSync(`${dbPath}-wal`)) fs.rmSync(`${dbPath}-wal`, { force: true });
          if (fs.existsSync(`${dbPath}-shm`)) fs.rmSync(`${dbPath}-shm`, { force: true });
        } catch { /* ignore */ }
      },
    },
  ];
}

for (const fixture of createFixtures()) {
  describe(`${fixture.name} shared behavior`, () => {
    beforeEach(() => {
      try {
        if (fs.existsSync(TEST_DIR)) {
          fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_DIR, { recursive: true });
      } catch { /* ignore */ }
    });

    afterEach(() => {
      fixture.cleanup();
      try {
        if (fs.existsSync(TEST_DIR)) {
          fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
      } catch { /* ignore */ }
    });

    it('returns empty object when no data exists', async () => {
      const backend = fixture.create();
      const records = await backend.load();
      expect(records).toEqual({});
      await backend.close();
    });

    it('round-trips conversation records', async () => {
      const backend = fixture.create();
      const records: Record<string, ConversationRecord> = {
        c1: {
          messages: [
            { role: 'user', content: 'hello', timestamp: 1000 },
            { role: 'assistant', content: 'hi', timestamp: 2000 },
          ],
          lastAccessedAt: 2000,
        },
      };
      await backend.save(records);
      const loaded = await backend.load();
      expect(loaded).toEqual(records);
      await backend.close();
    });

    it('overwrites existing records on save', async () => {
      const backend = fixture.create();
      await backend.save({
        c1: { messages: [{ role: 'user', content: 'old', timestamp: 1 }], lastAccessedAt: 1 },
      });
      await backend.save({
        c1: { messages: [{ role: 'user', content: 'new', timestamp: 2 }], lastAccessedAt: 2 },
      });
      const loaded = await backend.load();
      expect(loaded.c1.messages[0].content).toBe('new');
      await backend.close();
    });

    it('handles multiple conversations', async () => {
      const backend = fixture.create();
      const records: Record<string, ConversationRecord> = {
        c1: { messages: [{ role: 'user', content: 'a', timestamp: 1 }], lastAccessedAt: 1 },
        c2: { messages: [{ role: 'assistant', content: 'b', timestamp: 2 }], lastAccessedAt: 2 },
      };
      await backend.save(records);
      const loaded = await backend.load();
      expect(Object.keys(loaded)).toHaveLength(2);
      expect(loaded.c1.messages[0].content).toBe('a');
      expect(loaded.c2.messages[0].content).toBe('b');
      await backend.close();
    });

    it('handles empty records object', async () => {
      const backend = fixture.create();
      await backend.save({});
      const loaded = await backend.load();
      expect(loaded).toEqual({});
      await backend.close();
    });
  });
}
