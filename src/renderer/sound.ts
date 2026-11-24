export interface Alerter {
  /** 开始循环播放提示音 */
  start(): void;
  /** 播放一次提示音 */
  beepOnce(): void;
  /** 活动计时走满时播放一次的完成叮声，比提示音更轻快 */
  ding(): void;
  stop(): void;
  /** 全屏应用开始时暂停提示音，恢复展示后若提醒仍在进行则继续 */
  setMuted(muted: boolean): void;
}

/** 用 WebAudio 合成的提示音，不依赖任何音频文件 */
export function createAlerter(): Alerter {
  let context: AudioContext | null = null;
  let timer: number | null = null;
  let playing = false;
  let muted = false;

  const ensureContext = (): AudioContext => {
    if (context === null) {
      context = new AudioContext();
    }
    if (context.state === 'suspended') {
      void context.resume();
    }
    return context;
  };

  const beep = (): void => {
    const ctx = ensureContext();
    const start = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(784, start);
    oscillator.frequency.setValueAtTime(1046, start + 0.16);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.26, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.42);
  };

  const ding = (): void => {
    if (muted) {
      return;
    }
    const ctx = ensureContext();
    const start = ctx.currentTime;
    // 上行双音：B5 接 E6，柔和衰减，听感是「完成」的叮声
    const notes: [number, number][] = [
      [0, 987.77],
      [0.12, 1318.51],
    ];
    for (const [offset, frequency] of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.55);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.6);
    }
  };

  const runLoop = (): void => {
    beep();
    if (timer === null) {
      timer = window.setInterval(beep, 4000);
    }
  };

  const stopLoop = (): void => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  return {
    start(): void {
      playing = true;
      if (!muted) {
        runLoop();
      }
    },
    beepOnce(): void {
      if (!muted) {
        beep();
      }
    },
    ding,
    stop(): void {
      playing = false;
      stopLoop();
    },
    setMuted(nextMuted: boolean): void {
      muted = nextMuted;
      if (muted) {
        stopLoop();
      } else if (playing) {
        runLoop();
      }
    },
  };
}
