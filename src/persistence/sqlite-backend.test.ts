import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SqliteBackend } from './sqlite-backend';

const TEST_DIR = path.resolve(__dirname, '../../.test-sqlite');

function cleanup() {
  try {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}

describe('SqliteBackend', () => {
  beforeEach(() => {
    cleanup();
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('enables WAL mode', () => {
    const dbPath = path.join(TEST_DIR, 'test.db');
    const backend = new SqliteBackend(dbPath, undefined, 60000);
    // WAL mode creates a -wal file after first write
    backend.save({ c1: { messages: [], lastAccessedAt: 1 } });
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(true);
    backend.close();
  });

  it('migrates non-expired conversations from JSON on first startup', () => {
    const jsonPath = path.join(TEST_DIR, 'state.json');
    const dbPath = path.join(TEST_DIR, 'state.db');
    const now = Date.now();
    fs.writeFileSync(jsonPath, JSON.stringify({
      c1: { messages: [{ role: 'user', content: 'hello', timestamp: now }], lastAccessedAt: now },
      c2: { messages: [{ role: 'assistant', content: 'hi', timestamp: now }], lastAccessedAt: now - 100000 },
    }), 'utf-8');

    const backend = new SqliteBackend(dbPath, jsonPath, 60000);
    const loaded = backend.load();
    // c1 is within TTL (now - now = 0 < 60000), c2 is expired (now - (now - 100000) = 100000 > 60000)
    expect(loaded.c1).toBeDefined();
    expect(loaded.c1.messages[0].content).toBe('hello');
    expect(loaded.c2).toBeUndefined();
    backend.close();

    // JSON file should be renamed with .migrated- prefix
    const migratedFiles = fs.readdirSync(TEST_DIR).filter(f => f.startsWith('state.json.migrated-'));
    expect(migratedFiles.length).toBe(1);
  });

  it('does not migrate if DB already has data', () => {
    const jsonPath = path.join(TEST_DIR, 'state.json');
    const dbPath = path.join(TEST_DIR, 'state.db');

    // First backend creates DB with data (no jsonPath, so no migration)
    const backend1 = new SqliteBackend(dbPath, undefined, 60000);
    backend1.save({ existing: { messages: [{ role: 'user', content: 'existing', timestamp: 1 }], lastAccessedAt: 1 } });
    backend1.close();

    // Create a JSON file AFTER the DB already has data
    fs.writeFileSync(jsonPath, JSON.stringify({
      c1: { messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }], lastAccessedAt: Date.now() },
    }), 'utf-8');

    // Second backend should NOT migrate because DB already has data
    const backend2 = new SqliteBackend(dbPath, jsonPath, 60000);
    const loaded = backend2.load();
    expect(loaded.existing).toBeDefined();
    expect(loaded.c1).toBeUndefined();
    backend2.close();

    // Original JSON should still exist
    expect(fs.existsSync(jsonPath)).toBe(true);
  });

  it('handles corrupt JSON gracefully during migration', () => {
    const jsonPath = path.join(TEST_DIR, 'state.json');
    const dbPath = path.join(TEST_DIR, 'state.db');
    fs.writeFileSync(jsonPath, '{"broken":', 'utf-8');

    const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() };
    const backend = new SqliteBackend(dbPath, jsonPath, 60000, logger as any);
    const loaded = backend.load();
    expect(loaded).toEqual({});
    backend.close();

    // Original JSON should be untouched
    expect(fs.existsSync(jsonPath)).toBe(true);
    // Logger should have warned
    expect(logger.warn).toHaveBeenCalled();
  });

  it('handles missing JSON file gracefully', () => {
    const jsonPath = path.join(TEST_DIR, 'nonexistent.json');
    const dbPath = path.join(TEST_DIR, 'state.db');
    const backend = new SqliteBackend(dbPath, jsonPath, 60000);
    const loaded = backend.load();
    expect(loaded).toEqual({});
    backend.close();
  });

  it('closes without throwing', () => {
    const dbPath = path.join(TEST_DIR, 'test.db');
    const backend = new SqliteBackend(dbPath, undefined, 60000);
    backend.save({ c1: { messages: [], lastAccessedAt: 1 } });
    expect(() => backend.close()).not.toThrow();
  });
});
