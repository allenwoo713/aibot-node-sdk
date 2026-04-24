import { describe, it, expect, vi } from 'vitest';
import { parseScheduleCommand, handleScheduleCommand } from './schedule';

describe('parseScheduleCommand', () => {
  it('parses /日程 创建 with argument', () => {
    const result = parseScheduleCommand('/日程 创建 明天下午3点团队周会');
    expect(result).toEqual({ type: 'schedule', subcommand: 'create', arg: '明天下午3点团队周会' });
  });

  it('parses /日程 列表', () => {
    const result = parseScheduleCommand('/日程 列表');
    expect(result).toEqual({ type: 'schedule', subcommand: 'list', arg: '' });
  });

  it('parses /日程 列表 with trailing space', () => {
    const result = parseScheduleCommand('/日程 列表 ');
    expect(result).toEqual({ type: 'schedule', subcommand: 'list', arg: '' });
  });

  it('parses bare /日程 as create with empty arg', () => {
    const result = parseScheduleCommand('/日程');
    expect(result).toEqual({ type: 'schedule', subcommand: 'create', arg: '' });
  });

  it('returns null for non-command text', () => {
    expect(parseScheduleCommand('Hello bot')).toBeNull();
    expect(parseScheduleCommand('/文档 doc_123')).toBeNull();
  });
});

describe('handleScheduleCommand', () => {
  function createMockApiClient(response: { errcode: number; errmsg?: string; schedule_id?: string } = { errcode: 0, schedule_id: 'sched-123' }) {
    return {
      createSchedule: vi.fn().mockResolvedValue(response),
    } as any;
  }

  function createMockAdapter(result: { content: string; error?: boolean } = { content: '' }) {
    return {
      chat: vi.fn().mockResolvedValue(result),
    } as any;
  }

  function createMockScheduleStore(entries: any[] = []) {
    return {
      add: vi.fn().mockResolvedValue(undefined),
      listUpcoming: vi.fn().mockReturnValue(entries),
    } as any;
  }

  function createMockLogger() {
    return { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
  }

  describe('list subcommand', () => {
    it('returns empty-state message when no upcoming schedules', async () => {
      const store = createMockScheduleStore([]);
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'list', arg: '' },
        createMockApiClient(),
        createMockAdapter(),
        'user-1',
        store,
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(reply).toContain('暂无 upcoming 日程');
      expect(store.listUpcoming).toHaveBeenCalledWith('user-1', 5);
    });

    it('returns formatted list of upcoming schedules', async () => {
      const now = Math.floor(Date.now() / 1000);
      const store = createMockScheduleStore([
        { schedule_id: 's1', summary: '周会', start_time: now + 3600 },
        { schedule_id: 's2', summary: '评审', start_time: now + 7200 },
      ]);
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'list', arg: '' },
        createMockApiClient(),
        createMockAdapter(),
        'user-1',
        store,
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(reply).toContain('周会');
      expect(reply).toContain('评审');
    });
  });

  describe('create subcommand', () => {
    it('returns usage hint when arg is empty', async () => {
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '' },
        createMockApiClient(),
        createMockAdapter(),
        'user-1',
        createMockScheduleStore(),
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(reply).toContain('请提供日程描述');
    });

    it('creates schedule with Layer 1 extraction', async () => {
      const apiClient = createMockApiClient({ errcode: 0, schedule_id: 'sched-abc' });
      const store = createMockScheduleStore();
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '明天下午3点团队周会' },
        apiClient,
        createMockAdapter(),
        'user-1',
        store,
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(apiClient.createSchedule).toHaveBeenCalledTimes(1);
      const payload = apiClient.createSchedule.mock.calls[0][0];
      expect(payload.organizer).toBe('user-1');
      expect(payload.summary).toBe('下午团队周会');
      expect(payload.attendees).toEqual([{ userid: 'user-1' }]);
      expect(store.add).toHaveBeenCalledTimes(1);
      expect(reply).toContain('已创建日程');
      expect(reply).toContain('下午团队周会');
    });

    it('falls back to Layer 2 AI extraction when Layer 1 fails', async () => {
      const apiClient = createMockApiClient({ errcode: 0, schedule_id: 'sched-ai' });
      const adapter = createMockAdapter({
        content: '{"title":"AI会议","start_time":"2026-04-27 09:00","end_time":"2026-04-27 10:00"}',
      });
      const store = createMockScheduleStore();
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '三天后开会' },
        apiClient,
        adapter,
        'user-1',
        store,
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(adapter.chat).toHaveBeenCalledTimes(1);
      expect(apiClient.createSchedule).toHaveBeenCalledTimes(1);
      expect(store.add).toHaveBeenCalledTimes(1);
      expect(reply).toContain('已创建日程');
      expect(reply).toContain('AI会议');
    });

    it('returns hint when AI extraction returns error', async () => {
      const adapter = createMockAdapter({ content: '', error: true });
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '三天后开会' },
        createMockApiClient(),
        adapter,
        'user-1',
        createMockScheduleStore(),
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(reply).toContain('请提供更详细的日程信息');
    });

    it('returns hint when AI extraction returns invalid JSON', async () => {
      const adapter = createMockAdapter({ content: 'invalid json' });
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '三天后开会' },
        createMockApiClient(),
        adapter,
        'user-1',
        createMockScheduleStore(),
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(reply).toContain('请提供更详细的日程信息');
    });

    it('returns hint when AI extraction returns incomplete fields', async () => {
      const adapter = createMockAdapter({ content: '{"title":"AI会议"}' });
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '三天后开会' },
        createMockApiClient(),
        adapter,
        'user-1',
        createMockScheduleStore(),
        { maxInputTokens: 100 },
        createMockLogger(),
      );
      expect(reply).toContain('请提供更详细的日程信息');
    });

    it('returns failure message when WeCom API returns non-zero errcode', async () => {
      const apiClient = createMockApiClient({ errcode: 40001, errmsg: 'invalid credential' });
      const logger = createMockLogger();
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '明天下午3点团队周会' },
        apiClient,
        createMockAdapter(),
        'user-1',
        createMockScheduleStore(),
        { maxInputTokens: 100 },
        logger,
      );
      expect(reply).toBe('日程创建失败，请稍后重试。');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns failure message when WeCom API throws', async () => {
      const apiClient = {
        createSchedule: vi.fn().mockRejectedValue(new Error('network error')),
      } as any;
      const logger = createMockLogger();
      const reply = await handleScheduleCommand(
        { type: 'schedule', subcommand: 'create', arg: '明天下午3点团队周会' },
        apiClient,
        createMockAdapter(),
        'user-1',
        createMockScheduleStore(),
        { maxInputTokens: 100 },
        logger,
      );
      expect(reply).toBe('日程创建失败，请稍后重试。');
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
