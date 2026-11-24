/** 通过 Chrome DevTools Protocol 驱动真实窗口的最小客户端 */
const DEFAULT_TIMEOUT_MS = 15000;

export class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.socket = null;
  }

  connect(timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`连接调试目标超时：${this.url}`));
      }, timeoutMs);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(`无法连接 ${this.url}: ${event.message ?? '未知错误'}`));
      };
      socket.onclose = () => {
        for (const [id, entry] of this.pending) {
          this.pending.delete(id);
          entry.reject(new Error('调试连接已断开'));
        }
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id === undefined) {
          return;
        }
        const entry = this.pending.get(message.id);
        if (entry === undefined) {
          return;
        }
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) {
          entry.reject(new Error(`${message.error.message} (${message.error.code})`));
        } else {
          entry.resolve(message.result);
        }
      };
    });
  }

  send(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.nextId += 1;
    const id = this.nextId;
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`CDP 请求超时：${method}，窗口可能失去响应`));
        }, timeoutMs),
      };
      this.pending.set(id, entry);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`页面脚本执行失败: ${result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }

  close() {
    if (this.socket !== null) {
      this.socket.close();
      this.socket = null;
    }
  }
}

/** 列出调试端口上的全部页面目标 */
export async function listTargets(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: controller.signal });
    const targets = await response.json();
    return targets.filter((target) => target.type === 'page');
  } finally {
    clearTimeout(timer);
  }
}

/** 等待出现满足条件的页面目标，程序尚未打开调试端口时继续等待；onPoll 在每轮轮询后回调，供看门狗刷新进度 */
export async function waitForTarget(port, predicate, timeoutMs = 20000, onPoll) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets(port);
      const found = targets.find(predicate);
      if (found !== undefined) {
        return found;
      }
    } catch (error) {
      lastError = error;
    }
    if (onPoll) {
      onPoll();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`等待页面目标超时${lastError === null ? '' : `：${lastError.message}`}`);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
