import type { WeComApiClient } from '../../api';
import type { AiBackend } from '../../ai/adapter';
import type { BotConfig } from '../../config';
import type { Logger } from '../../types';
import type { ScheduleData } from '../../types/wecom-api';
import { ScheduleStore } from '../schedule-store';
import { parseScheduleDescription } from '../date-parser';

export interface ParsedScheduleCommand {
  type: 'schedule';
  subcommand: 'create' | 'list';
  arg: string;
}

export function parseScheduleCommand(content: string): ParsedScheduleCommand | null {
  const trimmed = content.trim();
  if (trimmed.startsWith('/日程 创建 ')) {
    return { type: 'schedule', subcommand: 'create', arg: trimmed.slice('/日程 创建 '.length).trim() };
  }
  if (trimmed === '/日程 列表' || trimmed.startsWith('/日程 列表 ')) {
    return { type: 'schedule', subcommand: 'list', arg: '' };
  }
  if (trimmed === '/日程') {
    return { type: 'schedule', subcommand: 'create', arg: '' };
  }
  return null;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

export async function handleScheduleCommand(
  command: ParsedScheduleCommand,
  apiClient: WeComApiClient,
  adapter: AiBackend,
  userid: string,
  scheduleStore: ScheduleStore,
  config: Pick<BotConfig, 'maxInputTokens'>,
  logger: Logger,
): Promise<string> {
  if (command.subcommand === 'list') {
    const upcoming = scheduleStore.listUpcoming(userid, 5);
    if (upcoming.length === 0) {
      return '暂无 upcoming 日程。发送 "/日程 创建 <描述>" 来创建一个。';
    }
    const lines = upcoming.map((e, i) => `${i + 1}. ${e.summary} — ${formatTime(e.start_time)}`);
    return ` upcoming 日程：\n${lines.join('\n')}`;
  }

  // create
  if (!command.arg) {
    return '请提供日程描述，例如：/日程 创建 明天下午3点团队周会';
  }

  let extraction = parseScheduleDescription(command.arg);

  if (!extraction) {
    // Layer 2: AI extraction
    const prompt = `从以下描述中提取日程信息，返回严格 JSON：\n{"title":"日程标题","start_time":"YYYY-MM-DD HH:mm","end_time":"YYYY-MM-DD HH:mm"}\n规则：\n- 如果缺少日期，假设为明天\n- 如果缺少时间，假设为上午9点\n- 如果缺少结束时间，假设持续1小时\n- title 必须简洁，不超过20字\n描述："${command.arg}"`;
    try {
      const result = await adapter.chat({
        conversationId: 'schedule-extract',
        message: prompt,
        contactType: 'internal',
        history: [],
      });
      if (result.error || !result.content) {
        return '请提供更详细的日程信息，例如：/日程 创建 明天下午3点团队周会';
      }
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return '请提供更详细的日程信息，例如：/日程 创建 明天下午3点团队周会';
      }
      const parsed = JSON.parse(jsonMatch[0]) as { title?: string; start_time?: string; end_time?: string };
      if (!parsed.title || !parsed.start_time || !parsed.end_time) {
        return '请提供更详细的日程信息，例如：/日程 创建 明天下午3点团队周会';
      }
      const startDate = new Date(parsed.start_time);
      const endDate = new Date(parsed.end_time);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return '请提供更详细的日程信息，例如：/日程 创建 明天下午3点团队周会';
      }
      extraction = {
        title: parsed.title.slice(0, 20),
        start_time: Math.floor(startDate.getTime() / 1000),
        end_time: Math.floor(endDate.getTime() / 1000),
      };
    } catch {
      return '请提供更详细的日程信息，例如：/日程 创建 明天下午3点团队周会';
    }
  }

  const scheduleData: ScheduleData = {
    organizer: userid,
    start_time: extraction.start_time,
    end_time: extraction.end_time,
    attendees: [{ userid }],
    summary: extraction.title,
    description: command.arg,
    is_remind: 1,
    remind_before_event_secs: 3600,
  };

  try {
    const response = await apiClient.createSchedule(scheduleData);
    if (response.errcode !== 0) {
      logger.warn('WeCom createSchedule failed', { errcode: response.errcode, errmsg: response.errmsg });
      return '日程创建失败，请稍后重试。';
    }
    await scheduleStore.add({
      schedule_id: response.schedule_id!,
      userid,
      summary: extraction.title,
      start_time: extraction.start_time,
      end_time: extraction.end_time,
      created_at: Math.floor(Date.now() / 1000),
    });
    return `已创建日程：${extraction.title}\n时间：${formatTime(extraction.start_time)} - ${formatTime(extraction.end_time)}\n参与人：${userid}`;
  } catch (err: any) {
    logger.warn('createSchedule threw', { error: err?.message });
    return '日程创建失败，请稍后重试。';
  }
}
