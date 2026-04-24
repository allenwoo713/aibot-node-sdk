import fs from 'fs';
import path from 'path';
import type { Logger } from '../types';

export interface ScheduleEntry {
  schedule_id: string;
  userid: string;
  summary: string;
  start_time: number; // Unix timestamp seconds
  end_time: number;   // Unix timestamp seconds
  created_at: number; // Unix timestamp seconds
}

export class ScheduleStore {
  private filePath: string;
  private entries: ScheduleEntry[] = [];
  private logger: Logger;

  constructor(options: { persistencePath: string; logger?: Logger }) {
    this.filePath = path.resolve(path.dirname(options.persistencePath), 'schedules.json');
    this.logger = options.logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as Logger;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.entries = JSON.parse(raw) as ScheduleEntry[];
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.warn('Failed to save schedules', { error: err?.message });
    }
  }

  async add(entry: ScheduleEntry): Promise<void> {
    this.entries.push(entry);
    this.save();
  }

  listUpcoming(userid: string, limit = 5): ScheduleEntry[] {
    const now = Math.floor(Date.now() / 1000);
    return this.entries
      .filter((e) => e.userid === userid && e.start_time >= now)
      .sort((a, b) => a.start_time - b.start_time)
      .slice(0, limit);
  }
}
