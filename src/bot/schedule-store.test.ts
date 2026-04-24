import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ScheduleStore } from './schedule-store';

const TEST_DIR = path.resolve(__dirname, '../../.test-schedules-data');
const TEST_PERSISTENCE_PATH = path.join(TEST_DIR, 'state.json');

function cleanup() {
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}

beforeEach(cleanup);
afterEach(cleanup);

function createStore() {
  return new ScheduleStore({ persistencePath: TEST_PERSISTENCE_PATH });
}

describe('ScheduleStore', () => {
  it('starts empty when no persistence file exists', () => {
    const store = createStore();
    const upcoming = store.listUpcoming('user-1');
    expect(upcoming).toEqual([]);
  });

  it('adds an entry and lists it', async () => {
    const store = createStore();
    const now = Math.floor(Date.now() / 1000);
    await store.add({
      schedule_id: 'sched-1',
      userid: 'user-1',
      summary: '周会',
      start_time: now + 3600,
      end_time: now + 7200,
      created_at: now,
    });

    const upcoming = store.listUpcoming('user-1');
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].schedule_id).toBe('sched-1');
    expect(upcoming[0].summary).toBe('周会');
  });

  it('filters entries by userid', async () => {
    const store = createStore();
    const now = Math.floor(Date.now() / 1000);
    await store.add({
      schedule_id: 'sched-1',
      userid: 'user-1',
      summary: '周会',
      start_time: now + 3600,
      end_time: now + 7200,
      created_at: now,
    });
    await store.add({
      schedule_id: 'sched-2',
      userid: 'user-2',
      summary: '评审',
      start_time: now + 3600,
      end_time: now + 7200,
      created_at: now,
    });

    const upcoming = store.listUpcoming('user-1');
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].userid).toBe('user-1');
  });

  it('filters out past events', async () => {
    const store = createStore();
    const now = Math.floor(Date.now() / 1000);
    await store.add({
      schedule_id: 'sched-past',
      userid: 'user-1',
      summary: '过去的会议',
      start_time: now - 3600,
      end_time: now - 1800,
      created_at: now - 7200,
    });
    await store.add({
      schedule_id: 'sched-future',
      userid: 'user-1',
      summary: '未来的会议',
      start_time: now + 3600,
      end_time: now + 7200,
      created_at: now,
    });

    const upcoming = store.listUpcoming('user-1');
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].schedule_id).toBe('sched-future');
  });

  it('sorts upcoming events by start_time ascending', async () => {
    const store = createStore();
    const now = Math.floor(Date.now() / 1000);
    await store.add({
      schedule_id: 'sched-later',
      userid: 'user-1',
      summary: ' later',
      start_time: now + 7200,
      end_time: now + 10800,
      created_at: now,
    });
    await store.add({
      schedule_id: 'sched-sooner',
      userid: 'user-1',
      summary: ' sooner',
      start_time: now + 1800,
      end_time: now + 3600,
      created_at: now,
    });

    const upcoming = store.listUpcoming('user-1');
    expect(upcoming[0].schedule_id).toBe('sched-sooner');
    expect(upcoming[1].schedule_id).toBe('sched-later');
  });

  it('respects the limit parameter', async () => {
    const store = createStore();
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 5; i++) {
      await store.add({
        schedule_id: `sched-${i}`,
        userid: 'user-1',
        summary: `会议 ${i}`,
        start_time: now + (i + 1) * 3600,
        end_time: now + (i + 2) * 3600,
        created_at: now,
      });
    }

    const upcoming = store.listUpcoming('user-1', 3);
    expect(upcoming).toHaveLength(3);
  });

  it('persists across store instances', async () => {
    const now = Math.floor(Date.now() / 1000);
    const store1 = createStore();
    await store1.add({
      schedule_id: 'sched-1',
      userid: 'user-1',
      summary: '周会',
      start_time: now + 3600,
      end_time: now + 7200,
      created_at: now,
    });

    const store2 = createStore();
    const upcoming = store2.listUpcoming('user-1');
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].schedule_id).toBe('sched-1');
  });
});
