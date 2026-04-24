import { describe, it, expect } from 'vitest';
import { parseScheduleDescription } from './date-parser';

describe('parseScheduleDescription', () => {
  it('returns null for empty string', () => {
    expect(parseScheduleDescription('')).toBeNull();
  });

  it('returns null for string without date keyword', () => {
    expect(parseScheduleDescription('team meeting at 3pm')).toBeNull();
  });

  it('parses 今天 with default time (9am, 1h)', () => {
    const result = parseScheduleDescription('今天团队周会');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expectedStart = new Date(now);
    expectedStart.setHours(9, 0, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);

    expect(result!.title).toBe('团队周会');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses 明天 with time', () => {
    const result = parseScheduleDescription('明天下午3点团队周会');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 1);
    const expectedStart = new Date(now);
    expectedStart.setHours(3, 0, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);

    expect(result!.title).toBe('下午团队周会');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses 后天 with colon time format', () => {
    const result = parseScheduleDescription('后天14:30项目评审');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 2);
    const expectedStart = new Date(now);
    expectedStart.setHours(14, 30, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);

    expect(result!.title).toBe('项目评审');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses 下周X', () => {
    const result = parseScheduleDescription('下周一10点周会');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const targetDay = 1; // Monday
    const daysUntil = (targetDay + 7 - now.getDay()) % 7 || 7;
    now.setDate(now.getDate() + daysUntil);
    const expectedStart = new Date(now);
    expectedStart.setHours(10, 0, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);

    expect(result!.title).toBe('周会');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses 下下周X', () => {
    const result = parseScheduleDescription('下下周三15:00分享会');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const targetDay = 3; // Wednesday
    const daysUntil = (targetDay + 7 - now.getDay()) % 7 || 7;
    now.setDate(now.getDate() + daysUntil + 7);
    const expectedStart = new Date(now);
    expectedStart.setHours(15, 0, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);

    expect(result!.title).toBe('分享会');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses dot time format', () => {
    const result = parseScheduleDescription('明天9.30早会');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 1);
    const expectedStart = new Date(now);
    expectedStart.setHours(9, 30, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);

    expect(result!.title).toBe('早会');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses 半小时 duration', () => {
    const result = parseScheduleDescription('明天10点半小时站立会');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 1);
    const expectedStart = new Date(now);
    expectedStart.setHours(10, 0, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 30 * 60 * 1000);

    expect(result!.title).toBe('站立会');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('parses 两小时 duration', () => {
    const result = parseScheduleDescription('明天14点两小时培训');
    expect(result).not.toBeNull();

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + 1);
    const expectedStart = new Date(now);
    expectedStart.setHours(14, 0, 0, 0);
    const expectedEnd = new Date(expectedStart.getTime() + 120 * 60 * 1000);

    expect(result!.title).toBe('培训');
    expect(result!.start_time).toBe(Math.floor(expectedStart.getTime() / 1000));
    expect(result!.end_time).toBe(Math.floor(expectedEnd.getTime() / 1000));
  });

  it('truncates title to 20 characters', () => {
    const longTitle = '这是一个非常非常非常非常非常非常长的会议标题';
    const result = parseScheduleDescription(`明天10点${longTitle}`);
    expect(result).not.toBeNull();
    expect(result!.title.length).toBeLessThanOrEqual(20);
  });

  it('falls back to trimmed input as title when title becomes empty', () => {
    const result = parseScheduleDescription('明天10点');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('明天10点'.slice(0, 20));
  });
});
