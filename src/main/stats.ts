import fs from 'node:fs';
import path from 'node:path';
import type { CompletionStats, ReminderItem } from '../shared/types';

const RECENT_LIMIT = 20;

const EMPTY: CompletionStats = { total: 0, byItem: {}, recent: [] };

/** 完成记录：每次完成提醒累加一份，写入 userData 的 stats.json，供完成统计与小树成长读取 */
export class StatsStore {
  private readonly filePath: string;
  private data: CompletionStats;

  constructor(directory: string) {
    this.filePath = path.join(directory, 'stats.json');
    this.data = this.read();
  }

  get(): CompletionStats {
    return this.data;
  }

  record(item: ReminderItem): void {
    const previous = this.data.byItem[item.id];
    this.data = {
      total: this.data.total + 1,
      byItem: {
        ...this.data.byItem,
        [item.id]: { name: item.name, glyph: item.glyph, count: (previous?.count ?? 0) + 1 },
      },
      recent: [{ name: item.name, glyph: item.glyph, at: Date.now() }, ...this.data.recent].slice(
        0,
        RECENT_LIMIT,
      ),
    };
    this.write();
  }

  private read(): CompletionStats {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<CompletionStats>;
      return {
        total: Number(raw.total) || 0,
        byItem: raw.byItem ?? {},
        recent: Array.isArray(raw.recent) ? raw.recent.slice(0, RECENT_LIMIT) : [],
      };
    } catch {
      // 统计是衍生数据，文件缺失或损坏时从零开始，不影响提醒主流程
      return { ...EMPTY, byItem: {}, recent: [] };
    }
  }

  private write(): void {
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, this.filePath);
  }
}
