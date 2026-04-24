export interface ScheduleExtractionResult {
  title: string;
  start_time: number; // Unix timestamp seconds
  end_time: number;   // Unix timestamp seconds
}

const WEEKDAY_MAP: Record<string, number> = {
  '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
};

function parseBaseDate(desc: string): Date | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (desc.includes('今天')) {
    return new Date(now);
  }
  if (desc.includes('明天')) {
    now.setDate(now.getDate() + 1);
    return now;
  }
  if (desc.includes('后天')) {
    now.setDate(now.getDate() + 2);
    return now;
  }

  const nextWeekMatch = desc.match(/下周([一二三四五六日])/);
  if (nextWeekMatch) {
    const targetDay = WEEKDAY_MAP[nextWeekMatch[1]];
    if (targetDay !== undefined) {
      const daysUntilTarget = (targetDay + 7 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntilTarget);
      return now;
    }
  }

  const nextNextWeekMatch = desc.match(/下下周([一二三四五六日])/);
  if (nextNextWeekMatch) {
    const targetDay = WEEKDAY_MAP[nextNextWeekMatch[1]];
    if (targetDay !== undefined) {
      const daysUntilTarget = (targetDay + 7 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntilTarget + 7);
      return now;
    }
  }

  return null;
}

function parseTimeAndDuration(desc: string): { hour: number; minute: number; durationMinutes: number } {
  let hour = 9;
  let minute = 0;
  let durationMinutes = 60;

  // Match X:XX or X.XX
  const timeMatch = desc.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = parseInt(timeMatch[2], 10);
  } else {
    // Match X点 or X点钟
    const hourMatch = desc.match(/(\d{1,2})(?:点|点钟)/);
    if (hourMatch) {
      hour = parseInt(hourMatch[1], 10);
    }
  }

  // Match duration
  if (desc.includes('半小时')) {
    durationMinutes = 30;
  } else if (desc.includes('一小时') || desc.includes('1小时') || desc.includes('一个小时')) {
    durationMinutes = 60;
  } else if (desc.includes('两小时') || desc.includes('2小时') || desc.includes('两个小时')) {
    durationMinutes = 120;
  }

  return { hour, minute, durationMinutes };
}

function buildResult(
  title: string,
  baseDate: Date,
  hour: number,
  minute: number,
  durationMinutes: number,
): ScheduleExtractionResult {
  const start = new Date(baseDate);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return {
    title: title.slice(0, 20),
    start_time: Math.floor(start.getTime() / 1000),
    end_time: Math.floor(end.getTime() / 1000),
  };
}

export function parseScheduleDescription(description: string): ScheduleExtractionResult | null {
  const trimmed = description.trim();
  if (!trimmed) return null;

  const baseDate = parseBaseDate(trimmed);
  if (!baseDate) {
    // No recognizable date keyword — signal AI fallback
    return null;
  }

  const { hour, minute, durationMinutes } = parseTimeAndDuration(trimmed);

  // Extract title by removing date/time expressions
  let title = trimmed
    .replace(/今天|明天|后天|下下周[一二三四五六日]|下周[一二三四五六日]/g, '')
    .replace(/\d{1,2}[:\.]\d{2}/g, '')
    .replace(/\d{1,2}(?:点|点钟)/g, '')
    .replace(/半小时|一小时|1小时|一个小时|两小时|2小时|两个小时/g, '')
    .trim();

  if (!title) {
    title = trimmed.slice(0, 20);
  }

  return buildResult(title, baseDate, hour, minute, durationMinutes);
}
