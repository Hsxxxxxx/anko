import fs from 'node:fs';
import path from 'node:path';
import type { Settings } from '../shared/types';
import { normalizeSettings } from '../shared/settings';

/** 设置文件读写：写入采用临时文件加替换，保证中途崩溃不会留下半个文件 */
export class SettingsStore {
  readonly filePath: string;
  /** 启动时的异常提示，例如设置文件损坏 */
  readonly notice: string | null;
  private data: Settings;

  constructor(directory: string) {
    this.filePath = path.join(directory, 'settings.json');
    const loaded = this.read();
    this.data = loaded.settings;
    this.notice = loaded.notice;
  }

  private read(): { settings: Settings; notice: string | null } {
    if (!fs.existsSync(this.filePath)) {
      return { settings: normalizeSettings(null), notice: null };
    }
    const text = fs.readFileSync(this.filePath, 'utf8');
    try {
      return { settings: normalizeSettings(JSON.parse(text)), notice: null };
    } catch (error) {
      const backup = `${this.filePath}.损坏-${Date.now()}.bak`;
      fs.renameSync(this.filePath, backup);
      const detail = error instanceof Error ? error.message : String(error);
      return {
        settings: normalizeSettings(null),
        notice: `设置文件无法解析，已备份为 ${path.basename(backup)} 并恢复默认设置（${detail}）`,
      };
    }
  }

  get(): Settings {
    return this.data;
  }

  save(next: Settings): Settings {
    const normalized = normalizeSettings(next);
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, this.filePath);
    this.data = normalized;
    return normalized;
  }

  reset(): Settings {
    return this.save(normalizeSettings(null));
  }
}
