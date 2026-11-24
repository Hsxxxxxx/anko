import { screen } from 'electron';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

/** 探针每多少毫秒采样一次前台窗口 */
const SAMPLE_INTERVAL_MS = 1000;
/** 连续相同采样达到该次数才认定状态切换，过滤误触与过渡帧 */
const CONFIRM_SAMPLES = 2;
/** 探针进程异常退出后多久再拉起 */
const RESTART_DELAY_MS = 5000;
/** 全屏判定：窗口与显示器边界的允许偏差（物理像素） */
const TOLERANCE = 4;

const CSHARP = `
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct AnkoRect
{
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public static class AnkoProbe
{
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hwnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hwnd, out AnkoRect rect);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
`;

// 每秒采样前台窗口：前台是锁屏界面时输出 LOCK；
// 矩形完整覆盖某个显示器时输出该显示器的物理像素矩形，否则输出 -。
// 只认矩形覆盖：最大化窗口受任务栏限制达不到显示器边缘，无边框窗口无论样式如何都按覆盖判定
const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition '${CSHARP.trim()}'
while ($true) {
  $line = '-'
  $hwnd = [AnkoProbe]::GetForegroundWindow()
  $procId = 0
  [AnkoProbe]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
  if ($procId -gt 0) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -ne $proc -and $proc.ProcessName -eq 'LockApp') {
      $line = 'LOCK'
    }
  }
  if ($line -eq '-' -and $hwnd -ne [IntPtr]::Zero -and [AnkoProbe]::IsWindowVisible($hwnd)) {
    $rect = New-Object AnkoRect
    if ([AnkoProbe]::GetWindowRect($hwnd, [ref]$rect)) {
      $w = $rect.Right - $rect.Left
      $h = $rect.Bottom - $rect.Top
      foreach ($m in [System.Windows.Forms.Screen]::AllScreens) {
        $b = $m.Bounds
        if (($w -ge ($b.Width - ${TOLERANCE})) -and ($h -ge ($b.Height - ${TOLERANCE})) -and ([Math]::Abs($rect.Left - $b.X) -le ${TOLERANCE}) -and ([Math]::Abs($rect.Top - $b.Y) -le ${TOLERANCE})) {
          $line = "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
          break
        }
      }
    }
  }
  [Console]::WriteLine($line)
  Start-Sleep -Milliseconds ${SAMPLE_INTERVAL_MS}
}
`;

/**
 * 全屏应用侦测：拉起一个 PowerShell 探针进程轮询前台窗口，
 * 状态稳定后按显示器汇报全屏的开始与结束。
 * 游戏、视频播放器、幻灯片放映在前台独占一个显示器时判定为全屏。
 */
export class FullscreenWatcher {
  private child: ChildProcess | null = null;
  private buffer = '';
  private confirmed = new Set<number>();
  private pending = new Map<number, { value: boolean; count: number }>();
  private lockScreen = false;
  private lockPending: { value: boolean; count: number } | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  /** 每完成一轮采样回调一次，调用方据此同步避让状态 */
  onSample: (() => void) | null = null;

  start(): void {
    this.spawnChild();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearRestartTimer();
    this.killChild();
    this.confirmed.clear();
    this.pending.clear();
    this.lockScreen = false;
    this.lockPending = null;
    this.buffer = '';
  }

  /** 前台是否为锁屏界面；进程启动时屏幕已锁定的场景下事件不会补发，靠这个状态补位 */
  isLockScreen(): boolean {
    return this.lockScreen;
  }

  /** 鼠标所在显示器是否有全屏应用 */
  isCursorDisplayFullscreen(): boolean {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return this.confirmed.has(display.id);
  }

  /** 指定显示器是否有全屏应用 */
  isDisplayFullscreen(displayId: number): boolean {
    return this.confirmed.has(displayId);
  }

  private spawnChild(): void {
    if (this.destroyed) {
      return;
    }
    console.log('[fullscreen] starting probe');
    this.child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { windowsHide: true },
    );
    this.child.stdout?.on('data', (chunk: Buffer) => this.append(chunk));
    this.child.on('exit', (code) => {
      console.log(`[fullscreen] probe exited code=${code}`);
      this.child = null;
      this.scheduleRestart();
    });
    this.child.on('error', (error) => {
      console.error('[fullscreen] probe failed:', error.message);
      this.killChild();
      this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    if (this.destroyed || this.restartTimer !== null) {
      return;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawnChild();
    }, RESTART_DELAY_MS);
    this.restartTimer.unref();
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private killChild(): void {
    if (this.child !== null) {
      this.child.kill();
      this.child = null;
    }
  }

  private append(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line !== '') {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    this.updateLock(line === 'LOCK');
    const parts = line.split(',');
    const fsRect: [number, number, number, number] | null =
      parts.length === 4 && parts.every((p) => Number.isFinite(Number(p)))
        ? (parts.map((p) => Number(p)) as [number, number, number, number])
        : null;
    let changed = false;
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      // 探针报的是物理像素，显示器尺寸换算成物理像素再比对
      const scale = display.scaleFactor;
      const phys = {
        x: display.bounds.x * scale,
        y: display.bounds.y * scale,
        w: display.bounds.width * scale,
        h: display.bounds.height * scale,
      };
      const observed =
        fsRect !== null &&
        Math.abs(fsRect[0] - phys.x) <= TOLERANCE &&
        Math.abs(fsRect[1] - phys.y) <= TOLERANCE &&
        Math.abs(fsRect[2] - fsRect[0] - phys.w) <= TOLERANCE &&
        Math.abs(fsRect[3] - fsRect[1] - phys.h) <= TOLERANCE;
      const state = this.confirmed.has(display.id);
      if (observed === state) {
        this.pending.delete(display.id);
        continue;
      }
      const candidate = this.pending.get(display.id);
      if (candidate !== undefined && candidate.value === observed && candidate.count + 1 >= CONFIRM_SAMPLES) {
        if (observed) {
          this.confirmed.add(display.id);
        } else {
          this.confirmed.delete(display.id);
        }
        this.pending.delete(display.id);
        changed = true;
        console.log(`[fullscreen] display ${display.id} fullscreen=${observed}`);
      } else {
        this.pending.set(display.id, { value: observed, count: (candidate?.count ?? 0) + 1 });
      }
    }
    const alive = new Set(displays.map((d) => d.id));
    for (const id of [...this.confirmed]) {
      if (!alive.has(id)) {
        this.confirmed.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.pending.clear();
    }
    this.onSample?.();
  }

  /** 锁屏状态与全屏确认同节奏：连续相同采样达到阈值才提交切换 */
  private updateLock(observed: boolean): void {
    if (observed === this.lockScreen) {
      this.lockPending = null;
      return;
    }
    const candidate = this.lockPending;
    if (candidate !== null && candidate.value === observed && candidate.count + 1 >= CONFIRM_SAMPLES) {
      this.lockScreen = observed;
      this.lockPending = null;
      console.log(`[fullscreen] lock screen=${observed}`);
    } else {
      this.lockPending = { value: observed, count: (candidate?.count ?? 0) + 1 };
    }
  }
}
