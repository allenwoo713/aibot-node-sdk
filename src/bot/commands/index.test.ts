import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCommand, handleCommand } from './index';

vi.mock('./document', async () => {
  const actual = await vi.importActual('./document');
  return {
    ...actual,
    handleDocumentCommand: vi.fn().mockResolvedValue('document-reply'),
  };
});

vi.mock('./schedule', async () => {
  const actual = await vi.importActual('./schedule');
  return {
    ...actual,
    handleScheduleCommand: vi.fn().mockResolvedValue('schedule-reply'),
  };
});

import { handleDocumentCommand } from './document';
import { handleScheduleCommand } from './schedule';

describe('parseCommand', () => {
  it('returns document command when input starts with /文档', () => {
    const result = parseCommand('/文档 doc_123');
    expect(result).toEqual({ type: 'document', arg: 'doc_123' });
  });

  it('returns schedule command when input starts with /日程', () => {
    const result = parseCommand('/日程 列表');
    expect(result).toEqual({ type: 'schedule', subcommand: 'list', arg: '' });
  });

  it('returns null for non-command text', () => {
    expect(parseCommand('Hello bot')).toBeNull();
    expect(parseCommand('/unknown command')).toBeNull();
  });
});

describe('handleCommand', () => {
  function createMocks() {
    return {
      apiClient: {} as any,
      adapter: {} as any,
      scheduleStore: {} as any,
      config: { maxInputTokens: 100 },
      logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } as any,
    };
  }

  beforeEach(() => {
    vi.mocked(handleDocumentCommand).mockClear();
    vi.mocked(handleScheduleCommand).mockClear();
  });

  it('dispatches document commands to handleDocumentCommand', async () => {
    const mocks = createMocks();
    const reply = await handleCommand(
      { type: 'document', arg: 'doc_123' },
      mocks.apiClient,
      mocks.adapter,
      'internal',
      'user-1',
      mocks.scheduleStore,
      mocks.config,
      mocks.logger,
    );
    expect(handleDocumentCommand).toHaveBeenCalledTimes(1);
    expect(handleDocumentCommand).toHaveBeenCalledWith(
      'doc_123',
      mocks.apiClient,
      mocks.adapter,
      'internal',
      mocks.config,
      mocks.logger,
    );
    expect(reply).toBe('document-reply');
  });

  it('dispatches schedule commands to handleScheduleCommand', async () => {
    const mocks = createMocks();
    const command = { type: 'schedule' as const, subcommand: 'list' as const, arg: '' };
    const reply = await handleCommand(
      command,
      mocks.apiClient,
      mocks.adapter,
      'internal',
      'user-1',
      mocks.scheduleStore,
      mocks.config,
      mocks.logger,
    );
    expect(handleScheduleCommand).toHaveBeenCalledTimes(1);
    expect(handleScheduleCommand).toHaveBeenCalledWith(
      command,
      mocks.apiClient,
      mocks.adapter,
      'user-1',
      mocks.scheduleStore,
      mocks.config,
      mocks.logger,
    );
    expect(reply).toBe('schedule-reply');
  });
});
