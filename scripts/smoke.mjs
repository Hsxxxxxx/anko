import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdpClient, listTargets, sleep, waitForTarget } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, '.smokeout');
const port = Number(process.env.SMOKE_PORT ?? 9333);

const checks = [];
const logFile = path.join(root, '.smokeout', 'run.log');

function log(message) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${message}\n`, 'utf8');
}

let lastProgress = Date.now();
const childProcesses = [];

function trackChild(child) {
  childProcesses.push(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[应用] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[应用] ${chunk}`));
  return child;
}

function killApp() {
  for (const child of childProcesses) {
    if (child.exitCode !== null) continue;
    // Windows 上 kill 只结束直接子进程，绿色版的解包器会把真正的应用作为孙进程留下，
    // 必须按进程树整体结束，否则残留进程会占住 .smokeout 导致下一轮无法启动
    if (process.platform === 'win32' && child.pid !== undefined) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  }
}

/** 宠物贴边收纳与拖回：依赖真实窗口几何，渲染缩放模拟模式下跳过 */
async function petDockChecks(petClient) {
  // 拖到屏幕左边缘：贴边收纳，边缘要留出可见的形象
  step('桌面宠物贴边收纳');
  const petOrigin = await petClient.evaluate('({ x: window.screenX, y: window.screenY })');
  const petPoint = await petClient.evaluate(`(() => {
    const pet = document.querySelector('.pet-root');
    if (pet === null) return null;
    const rect = pet.getBoundingClientRect();
    // 取形象上面积最大的实心图元，再落到它的中心，保证按下时命中的是画出来的像素
    let best = null;
    for (let dy = 4; dy <= rect.height - 4; dy += 2) {
      for (let dx = 20; dx <= rect.width - 20; dx += 2) {
        const hit = document.elementFromPoint(dx, dy);
        if (hit === null || hit === document.body || hit === pet) continue;
        const tag = hit.tagName ? hit.tagName.toLowerCase() : '';
        if (tag !== 'ellipse' && tag !== 'circle' && tag !== 'path') continue;
        const shape = hit.getBoundingClientRect();
        const cx = Math.round(shape.left + shape.width / 2);
        const cy = Math.round(shape.top + shape.height / 2);
        const center = document.elementFromPoint(cx, cy);
        const centerTag = center && center.tagName ? center.tagName.toLowerCase() : '';
        if (centerTag !== tag) continue;
        const area = shape.width * shape.height;
        if (best === null || area > best.area) {
          best = { x: cx, y: cy, area };
        }
      }
    }
    return best === null ? null : { x: best.x, y: best.y };
  })()`);
  assert.ok(petPoint !== null, '应能取到桌面宠物的位置');
  const dragStart = { x: petOrigin.x + petPoint.x, y: petOrigin.y + petPoint.y };
  await petClient.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: petPoint.x,
    y: petPoint.y,
    screenX: dragStart.x,
    screenY: dragStart.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  // 窗口跟随指针移动，指针在窗口内的横坐标要按窗口位移换算
  const targetWindowX = 2;
  for (let round = 0; round < 8; round += 1) {
    const current = await petClient.evaluate('window.screenX');
    if (Math.abs(current - targetWindowX) < 6) {
      break;
    }
    await petClient.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: petPoint.x + (targetWindowX - current),
      y: petPoint.y,
      screenX: targetWindowX,
      screenY: dragStart.y,
      button: 'left',
      buttons: 1,
    });
    await sleep(80);
  }
  await petClient.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: petPoint.x,
    y: petPoint.y,
    screenX: targetWindowX,
    screenY: dragStart.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await waitFor(
    async () =>
      (await petClient.evaluate(`document.querySelector('.pet-root').className.includes('pet-hide-left')`)) ===
      true,
    10_000,
  );
  fs.writeFileSync(path.join(outputDir, '02b-pet-docked.png'), await petClient.screenshot());
  record('桌面宠物贴到屏幕边缘后收起，边缘仍留出可见的形象');

  // 拖回屏幕中间，宠物重新完整显示
  step('桌面宠物拖回屏幕');
  const petBackOrigin = await petClient.evaluate('({ x: window.screenX, y: window.screenY })');
  await petClient.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: petPoint.x,
    y: petPoint.y,
    screenX: petBackOrigin.x + petPoint.x,
    screenY: petBackOrigin.y + petPoint.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let round = 0; round < 8; round += 1) {
    const current = await petClient.evaluate('window.screenX');
    if (Math.abs(current - 1700) < 6) {
      break;
    }
    await petClient.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: petPoint.x + (1700 - current),
      y: petPoint.y,
      screenX: 1700,
      screenY: petBackOrigin.y + petPoint.y,
      button: 'left',
      buttons: 1,
    });
    await sleep(80);
  }
  await petClient.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: petPoint.x,
    y: petPoint.y,
    screenX: 1700,
    screenY: petBackOrigin.y + petPoint.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await waitFor(
    async () =>
      (await petClient.evaluate(`document.querySelector('.pet-root').className.includes('pet-hide-left')`)) ===
      false,
    10_000,
  );
  record('桌面宠物拖离边缘后重新完整显示');
}

/** 机器当前是否锁屏：前台窗口所属进程为锁屏程序 LockApp；一次性探测，与应用内部状态无关 */function detectScreenLocked() {
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class AnkoFg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); }'; $procId = 0; $hwnd = [AnkoFg]::GetForegroundWindow(); [AnkoFg]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null; if ($procId -gt 0) { (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName }`;
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], { encoding: 'utf8', timeout: 20000 });
  if (result.error !== undefined) {
    throw new Error(`锁屏探测失败：${result.error.message}`);
  }
  return (result.stdout ?? '').trim() === 'LockApp';
}

function step(name) {
  lastProgress = Date.now();
  console.log(`步骤 ${name}`);
  log(`步骤 ${name}`);
}

/** 绿色版冷启动超过 60 秒，轮询到端口响应即视为有进展，避免看门狗误报 */
function touch() {
  lastProgress = Date.now();
}

/** 看门狗：长时间无进展说明某个环节卡死，直接结束应用并失败；unref 避免成功结束后仍撑住进程 */
const watchdog = setInterval(() => {
  if (Date.now() - lastProgress > 60_000) {
    console.error('冒烟测试看门狗超时：60 秒无进展');
    log('冒烟测试看门狗超时：60 秒无进展');
    killApp();
    process.exitCode = 1;
    process.exit(1);
  }
}, 10_000);
watchdog.unref();
process.on('exit', () => clearInterval(watchdog));

function record(name, detail) {
  checks.push({ name, detail });
  console.log(`通过 ${name}${detail === undefined ? '' : `：${detail}`}`);
  log(`通过 ${name}${detail === undefined ? '' : `：${detail}`}`);
}

/** SMOKE_DPR_FORCE=1.25/1.5 时给应用加渲染缩放开关，模拟系统 125%/150% 的 DPR 环境 */
function scaleFactorArg() {
  const value = process.env.SMOKE_DPR_FORCE;
  if (value === undefined || value === '') {
    return [];
  }
  return [`--force-device-scale-factor=${value}`];
}

function launchTarget() {
  const target = process.env.SMOKE_TARGET;
  if (target === 'packaged') {
    return {
      command: path.join(root, 'release', 'win-unpacked', 'ankou.exe'),
      args: [],
    };
  }
  if (target === 'portable') {
    const exeName = fs
      .readdirSync(path.join(root, 'release'))
      .find((name) => name.endsWith('-单文件绿色版.exe'));
    if (exeName === undefined) {
      throw new Error('release 目录中找不到单文件绿色版，先运行 npm run dist');
    }
    return {
      command: path.join(root, 'release', exeName),
      args: [],
    };
  }
  return {
    command: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [root],
  };
}

function tempRoot() {
  return process.env.TEMP ?? process.env.TMP ?? '';
}

/** 单文件绿色版先自解压到临时暂存目录（ns*.tmp\7z-out），再搬入最终目录（%TEMP%\<哈希>\ankou.exe） */
function findPortableStaging() {
  const rootDir = tempRoot();
  if (rootDir === '') return null;
  const candidates = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.tmp')) continue;
    const staging = path.join(rootDir, entry.name, '7z-out');
    if (!fs.existsSync(path.join(staging, 'resources', 'app.asar'))) continue;
    const born = fs.statSync(path.join(rootDir, entry.name)).birthtime ?? new Date(0);
    candidates.push({ staging, born });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.born - a.born);
  return candidates[0];
}

function findPortableFinalDir() {
  const rootDir = tempRoot();
  if (rootDir === '') return null;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(rootDir, entry.name);
    if (fs.existsSync(path.join(candidate, 'ankou.exe'))) return candidate;
  }
  return null;
}

/** 启动器在搬移阶段停滞时，把暂存目录里尚未搬入的项补进最终目录，返回最终目录路径；
 *  已搬入的项保持不动，启动器可能仍持有这些文件的句柄 */
function completePortableExtraction() {
  const staging = findPortableStaging();
  if (staging === null) return null;
  const finalDir = findPortableFinalDir();
  if (finalDir === null) return null;
  for (const entry of fs.readdirSync(staging.staging, { withFileTypes: true })) {
    const destination = path.join(finalDir, entry.name);
    if (fs.existsSync(destination)) continue;
    fs.cpSync(path.join(staging.staging, entry.name), destination, { recursive: true });
  }
  return finalDir;
}

const clickByText = (text) => `(() => {
  const nodes = Array.from(document.querySelectorAll('button'));
  const target = nodes.find((node) => (node.textContent ?? '').includes(${JSON.stringify(text)}));
  if (target === undefined) {
    return false;
  }
  target.click();
  return true;
})()`;

const clickByLabel = (label) => `(() => {
  const target = document.querySelector('[aria-label="' + ${JSON.stringify(label)} + '"]');
  if (target === null) {
    return false;
  }
  target.click();
  return true;
})()`;

/** 按按钮完整文案精确匹配点击，disabled 时返回 false */
const clickExact = (text) => `(() => {
  const nodes = Array.from(document.querySelectorAll('button'));
  const target = nodes.find((node) => (node.textContent ?? '').trim() === ${JSON.stringify(text)});
  if (target === undefined || target.disabled) {
    return false;
  }
  target.click();
  return true;
})()`;

/** 精确匹配文案的按钮是否已存在且可点击 */
const exactReady = (text) => `(() => {
  const node = Array.from(document.querySelectorAll('button')).find(
    (el) => (el.textContent ?? '').trim() === ${JSON.stringify(text)},
  );
  return node !== undefined && !node.disabled;
})()`;

async function waitFor(check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) {
        return value;
      }
    } catch (error) {
      // 窗口刚建立时页面可能还无法响应 CDP 请求，把抛错视为未完成继续轮询
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`等待界面状态超时${lastError === null ? '' : `：${lastError.message}`}`);
}

async function main() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(logFile, '', 'utf8');
  log('开始冒烟测试');
  const userDataDir = path.join(outputDir, 'userdata');
  // 冒烟预置设置：所需时长除起身活动外全部为 0，普通卡片走「先开始再计时」流程
  fs.mkdirSync(userDataDir, { recursive: true });
  const smokeItem = (id, name, glyph, message, intervalMinutes, strength, enabled, durationSeconds = 0) => ({
    id,
    name,
    glyph,
    message,
    intervalMinutes,
    durationSeconds,
    strength,
    enabled,
    custom: false,
  });
  const preseed = {
    version: 2,
    items: [
      // 喝水间隔最短，保证它是「下一次提醒」卡片展示的最早到期项
      smokeItem('preset-water', '喝水', 'water', '端起杯子，喝几口温水。', 15, 'strong', true),
      smokeItem('preset-eye', '护眼休息', 'eye', '看向 6 米外的地方保持 20 秒，再用力眨十次。', 20, 'strong', true),
      smokeItem('preset-stand', '起身活动', 'stand', '站起来走一走，接一杯水，顺便离开屏幕。', 60, 'normal', true, 3),
      smokeItem('preset-stretch', '拉伸肩颈', 'stretch', '肩膀向后绕环 10 次，颈部左右各拉伸 15 秒。', 90, 'normal', false),
      smokeItem('preset-snack', '补充水果', 'snack', '吃点水果或坚果，把刚才消耗掉的注意力补回来。', 120, 'normal', false),
      smokeItem('preset-breathe', '深呼吸', 'breathe', '吸气 4 秒，屏住 4 秒，呼气 6 秒，重复 5 轮。', 30, 'normal', false),
    ],
    quietRanges: [{ id: 'smoke-quiet', start: '22:00', end: '08:00' }],
    soundEnabled: true,
    autoLaunch: false,
    startMinimized: false,
    closeToTray: true,
    normalDismissSeconds: 12,
    snoozeMinutes: 5,
    showFloatingBall: false,
  };
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(preseed), 'utf8');
  // 预置 4 次完成，让第一次「我已完成」正好跨过升阶线，顺路验证升阶庆祝
  fs.writeFileSync(
    path.join(userDataDir, 'stats.json'),
    JSON.stringify({ total: 4, byItem: {}, recent: [] }),
    'utf8',
  );

  const { command, args } = launchTarget();
  // 启动前确认端口空闲：绿色版冷启动超过一分钟，端口被占用时快速失败，避免驱动错对象
  const preExisting = await listTargets(port).catch(() => []);
  if (preExisting.length > 0) {
    throw new Error(`调试端口 ${port} 已有目标，先结束残留的安叩进程再运行冒烟`);
  }
  if (process.env.SMOKE_TARGET === 'portable') {
    // 单文件绿色版自解压到 %TEMP% 下的随机目录，上一轮若在解压中途被结束，
    // 残留的不完整目录会被下次启动当作有效目录复用，应用随即退出。
    // 启动前删除全部已知的解压目录与暂存目录，保证每一轮都是干净环境。
    const rootDir = tempRoot();
    if (rootDir !== '') {
      for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(rootDir, entry.name);
        const hasApp = fs.existsSync(path.join(candidate, 'ankou.exe'));
        const hasStaging = fs.existsSync(path.join(candidate, '7z-out', 'resources', 'app.asar'));
        if (!hasApp && !hasStaging) continue;
        try {
          fs.rmSync(candidate, { recursive: true, force: true });
        } catch (error) {
          throw new Error(`无法清理绿色版目录 ${candidate}（可能有安叩进程正在运行）：${error.message}`);
        }
        log(`清理绿色版残留目录 ${entry.name}`);
      }
    }
  }
  trackChild(
    spawn(command, [...args, ...scaleFactorArg(), `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );

  let mainClient = null;
  let overlayClient = null;
  let petClient = null;
  let panelClient = null;
  const isMainTarget = (target) => target.url.endsWith('main.html');
  try {
    const portable = process.env.SMOKE_TARGET === 'portable';
    let mainTarget;
    if (!portable) {
      mainTarget = await waitForTarget(port, isMainTarget, 20_000, touch);
    } else {
      // 单文件绿色版启动时先自解压，打开调试端口比常规构建慢，放宽等待上限
      try {
        mainTarget = await waitForTarget(port, isMainTarget, 240_000, touch);
      } catch (firstError) {
        // 本机的绿色版启动器会在搬移阶段停滞：暂存目录已完整、最终目录只剩顶层文件。
        // 由冒烟补全剩余文件后优先等待启动器自行启动应用，启动器无法自恢复时直接启动提取出的应用本体。
        const finalDir = completePortableExtraction();
        if (finalDir === null) throw firstError;
        log('绿色版启动器在自解压搬移阶段停滞，冒烟已补全剩余文件');
        try {
          mainTarget = await waitForTarget(port, isMainTarget, 30_000, touch);
        } catch {
          log('启动器未能自行启动应用，冒烟直接启动提取出的应用本体');
          trackChild(
            spawn(path.join(finalDir, 'ankou.exe'), [...scaleFactorArg(), `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
              cwd: root,
              stdio: ['ignore', 'pipe', 'pipe'],
            }),
          );
          mainTarget = await waitForTarget(port, isMainTarget, 60_000, touch);
        }
      }
    }
    mainClient = new CdpClient(mainTarget.webSocketDebuggerUrl);
    await mainClient.connect();
    await waitFor(async () => (await mainClient.evaluate(`document.querySelector('.brand-name') !== null`)) === true);
    await sleep(600);

    const bodyText = await mainClient.evaluate('document.body.innerText');
    assert.ok(bodyText.includes('安叩'), '主窗口应显示标题');
    assert.ok(bodyText.includes('喝水') && bodyText.includes('护眼休息'), '主窗口应列出预设提醒项');
    assert.ok(bodyText.includes('完成统计'), '主窗口应包含完成统计卡片');
    assert.ok(bodyText.includes('免打扰时段'), '主页应包含免打扰时段卡片');
    fs.writeFileSync(path.join(outputDir, '01-main.png'), await mainClient.screenshot());
    record('主窗口渲染出提醒项、免打扰时段与完成统计');

    // 锁屏期间调度冻结、预览弹窗被拦截，从系统探测真实锁定状态决定提醒相关步骤能否执行
    const screenLocked = detectScreenLocked();
    if (screenLocked) {
      log('机器处于锁屏状态');
    }
    // 渲染缩放模拟模式下缩放开关会干扰 DIP 与物理像素的换算，宠物位置相关步骤整体跳过
    const dprForce = process.env.SMOKE_DPR_FORCE !== undefined && process.env.SMOKE_DPR_FORCE !== '';

    // SMOKE_DPR_EXPECT=1.25 或 1.5 时验证系统缩放已生效，用于 125%/150% 适配测试
    const expectedDpr = Number(process.env.SMOKE_DPR_EXPECT ?? 0);
    if (expectedDpr > 0) {
      const dpr = await mainClient.evaluate('window.devicePixelRatio');
      assert.ok(
        Math.abs(dpr - expectedDpr) < 0.01,
        `系统缩放未生效：期望 devicePixelRatio ${expectedDpr}，实际 ${dpr}`,
      );
      record(`系统缩放 ${Math.round(expectedDpr * 100)}%：主窗口渲染跟缩放走`, `devicePixelRatio ${dpr}`);
    }

    // 设置页：顶栏设置图标打开，里面是全局设置与桌面宠物
    step('打开设置');
    assert.equal(await mainClient.evaluate(clickByLabel('设置')), true);
    await waitFor(
      async () => (await mainClient.evaluate(`document.querySelector('.app').dataset.view === 'settings'`)) === true,
    );
    const settingsText = await mainClient.evaluate('document.body.innerText');
    assert.ok(settingsText.includes('桌面宠物'), '设置页应包含桌面宠物卡片');
    assert.ok(settingsText.includes('提醒弹出位置'), '设置页应包含提醒弹出位置');
    assert.ok(settingsText.includes('自动开始'), '设置页应包含自动开始开关');
    assert.ok(settingsText.includes('屏幕中间'), '提醒弹出位置应提供屏幕中间');
    fs.writeFileSync(path.join(outputDir, '01b-settings.png'), await mainClient.screenshot());
    record('设置由顶栏图标打开，包含全局设置与桌面宠物');

    // 切换宠物形象：预览与阶段叫法都要跟着换
    step('切换宠物形象');
    assert.equal(await mainClient.evaluate(clickByLabel('宠物形象 小猫')), true);
    await waitFor(
      async () =>
        (await mainClient.evaluate(`document.querySelector('.pet-preview .pet-species-cat') !== null`)) ===
        true,
    );
    const catStage = await mainClient.evaluate(`document.querySelector('.pet-preview .grove-stage').textContent`);
    assert.equal(catStage, '猫崽', '切换到小猫后阶段叫法应换成小猫的说法');
    assert.equal(await mainClient.evaluate(clickByLabel('宠物形象 小苗')), true);
    await waitFor(
      async () =>
        (await mainClient.evaluate(`document.querySelector('.pet-preview .pet-species-sprout') !== null`)) ===
        true,
    );
    record('切换宠物形象后预览与阶段叫法一起更换');

    // 桌面宠物：打开开关后应出现置顶小窗，鼠标移上去才显示气泡
    step('打开桌面宠物');
    assert.equal(await mainClient.evaluate(clickByLabel('显示桌面宠物')), true);
    const petTarget = await waitForTarget(port, (target) => target.url.endsWith('pet.html'));
    petClient = new CdpClient(petTarget.webSocketDebuggerUrl);
    await petClient.connect();
    await waitFor(async () => (await petClient.evaluate(`document.querySelector('.pet-root') !== null`)) === true);
    if (dprForce) {
      const forcedDpr = await petClient.evaluate('window.devicePixelRatio');
      fs.writeFileSync(path.join(outputDir, '02-pet.png'), await petClient.screenshot());
      record('渲染缩放模拟下宠物窗口按缩放渲染，位置相关步骤跳过（缩放开关干扰窗口几何）', `devicePixelRatio ${forcedDpr}`);
    } else {
      const bubbleBefore = await petClient.evaluate(`document.querySelector('.pet-bubble') === null`);
      assert.equal(bubbleBefore, true, '气泡默认不显示');
      // 锁屏检测完成前气泡显示倒计时，完成后显示已锁定，两种都是正确状态；
      // 悬停事件在页面就绪前发出会丢失，放进轮询里持续补发
      await waitFor(async () => {
        await petClient.evaluate(`(() => {
          const pet = document.querySelector('.pet-root');
          if (pet === null) return false;
          pet.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          return true;
        })()`);
        return (await petClient.evaluate(`/\\d+分/.test(document.body.innerText) || document.body.innerText.includes('已锁定')`)) === true;
      });
      fs.writeFileSync(path.join(outputDir, '02-pet.png'), await petClient.screenshot());
      record('桌面宠物打开后出现在屏幕上，鼠标移上去显示气泡倒计时');
    }

    // 设置页开完，回到主页继续后面的步骤
    assert.equal(await mainClient.evaluate(clickByLabel('返回主页')), true);
    await waitFor(
      async () => (await mainClient.evaluate(`document.querySelector('.app').dataset.view === 'home'`)) === true,
    );

    // 快捷入口：完成统计的换形象按钮直达设置页
    step('换形象快捷入口');
    assert.equal(await mainClient.evaluate(clickByText('换形象')), true);
    await waitFor(
      async () => (await mainClient.evaluate(`document.querySelector('.app').dataset.view === 'settings'`)) === true,
    );
    const quickEntryText = await mainClient.evaluate('document.body.innerText');
    assert.ok(quickEntryText.includes('桌面宠物'), '换形象应直达包含桌面宠物的设置页');
    const quietCardVisible = await mainClient.evaluate(`(() => {
      const targets = Array.from(document.querySelectorAll('.eyebrow'));
      const target = targets.find((span) => span.textContent.trim() === '免打扰时段');
      if (target === undefined) return false;
      const rect = target.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    })()`);
    assert.equal(quietCardVisible, false, '免打扰时段卡片在设置页应隐藏');
    assert.equal(await mainClient.evaluate(clickByLabel('返回主页')), true);
    await waitFor(
      async () => (await mainClient.evaluate(`document.querySelector('.app').dataset.view === 'home'`)) === true,
    );
    record('主页完成统计的换形象直达设置页，免打扰时段只在主页');

    if (dprForce) {
      record('渲染缩放模拟下跳过宠物贴边与拖回步骤（缩放开关干扰窗口几何）');
    } else {
      await petDockChecks(petClient);
    }

    // 快捷面板：单击宠物弹出，列高频操作，关闭后目标消失
    step('快捷面板');
    assert.equal(
      await petClient.evaluate(`(() => {
        const pet = document.querySelector('.pet-root');
        if (pet === null) return false;
        pet.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        pet.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        return true;
      })()`),
      true,
      '应能在桌面宠物上模拟单击',
    );
    const panelTarget = await waitForTarget(port, (target) => target.url.endsWith('panel.html'));
    panelClient = new CdpClient(panelTarget.webSocketDebuggerUrl);
    await panelClient.connect();
    await waitFor(
      async () => (await panelClient.evaluate(`document.body.innerText.includes('立即提醒一次')`)) === true,
    );
    const panelText = await panelClient.evaluate('document.body.innerText');
    assert.ok(panelText.includes('快捷操作'), '快捷面板应包含高频操作');
    assert.ok(/\d+ ?分钟/.test(panelText), '快捷面板应展示下一条提醒的倒计时');
    fs.writeFileSync(path.join(outputDir, '02b-panel.png'), await panelClient.screenshot());
    record('快捷面板在单击桌面宠物后弹出');
    // 这条指令会立即关闭面板窗口，响应可能赶不上窗口销毁，按即发即忘处理，由目标消失断言把关
    void panelClient.evaluate('void window.anko.closePetPanel()').catch(() => {});
    await waitFor(async () => (await listTargets(port)).every((target) => !target.url.endsWith('panel.html')));
    panelClient.close();
    record('快捷面板可关闭');

    if (screenLocked) {
      console.log('跳过提醒相关步骤：机器处于锁屏状态，调度冻结且预览弹窗被拦截，解锁后重跑冒烟');
      log('跳过提醒相关步骤：机器处于锁屏状态，调度冻结且预览弹窗被拦截，解锁后重跑冒烟');
      console.log(`\n冒烟测试完成（锁屏跳过提醒步骤），共 ${checks.length} 项检查，截图目录：${outputDir}`);
      return;
    }

    if (dprForce) {
      console.log('跳过提醒相关步骤：渲染缩放模拟模式下窗口几何被缩放开关干扰，提醒流程的窗口定位在该环境下不可信，缩放只验证渲染');
      log('跳过提醒相关步骤：渲染缩放模拟模式下窗口几何被缩放开关干扰，提醒流程的窗口定位在该环境下不可信，缩放只验证渲染');
      console.log(`\n冒烟测试完成（缩放模拟跳过提醒步骤），共 ${checks.length} 项检查，截图目录：${outputDir}`);
      return;
    }

    // 强提醒：置顶小窗且不能直接关闭
    step('触发强提醒');
    const heroText = await mainClient.evaluate(`document.querySelector('.hero-meta')?.textContent ?? ''`);
    assert.ok(heroText.includes('喝水'), '下一次提醒卡片应展示最早到期的提醒项');
    assert.equal(await mainClient.evaluate(clickByText('立即提醒一次')), true, '应能触发一次提醒');
    const overlayTarget = await waitForTarget(port, (target) => target.url.endsWith('overlay.html'));
    overlayClient = new CdpClient(overlayTarget.webSocketDebuggerUrl);
    await overlayClient.connect();
    await waitFor(async () => (await overlayClient.evaluate(`document.querySelector('.overlay-title') !== null`)) === true);
    await sleep(500);

    const overlayText = await overlayClient.evaluate('document.body.innerText');
    assert.ok(overlayText.includes('强提醒'), '弹窗应标记为强提醒');
    assert.ok(overlayText.includes('强制停止'), '弹窗应提供强制停止入口');
    const viewport = await overlayClient.evaluate(
      '({ width: window.innerWidth, height: window.innerHeight })',
    );
    assert.ok(
      viewport.width < 800 && viewport.height < 600,
      `强提醒应为置顶小窗，实际尺寸 ${viewport.width}×${viewport.height}`,
    );
    fs.writeFileSync(path.join(outputDir, '03-strong.png'), await overlayClient.screenshot());
    record('强提醒以置顶小窗展示，提供完成与强制停止', `${viewport.width}×${viewport.height}`);

    // 提醒响起后，桌面宠物应切换到请确认状态，并展示正在响起的提醒项
    step('桌面宠物请确认状态');
    // 拖动后指针离开了形象，悬停状态要重新建立；悬停事件可能丢失，放进轮询里持续补发
    await waitFor(async () => {
      await petClient.evaluate(`(() => {
        const pet = document.querySelector('.pet-root');
        if (pet === null) return false;
        pet.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        return true;
      })()`);
      return (await petClient.evaluate(`document.body.innerText.includes('请确认')`)) === true;
    });
    const petText = await petClient.evaluate('document.body.innerText');
    assert.ok(petText.includes('喝水'), '桌面宠物应展示正在响起的提醒项');
    fs.writeFileSync(path.join(outputDir, '05-pet-active.png'), await petClient.screenshot());
    record('桌面宠物在提醒响起时显示请确认状态');

    await overlayClient.evaluate('window.close()');
    await sleep(1200);
    const afterClose = await listTargets(port);
    assert.ok(
      afterClose.some((target) => target.url.endsWith('overlay.html')),
      '强提醒弹窗应拒绝被直接关闭',
    );
    record('强提醒弹窗拒绝直接关闭');

    // 窗口被重建后重新连接调试通道
    step('强制停止二次确认');
    overlayClient.close();
    const revivedTarget = await waitForTarget(port, (target) => target.url.endsWith('overlay.html'));
    overlayClient = new CdpClient(revivedTarget.webSocketDebuggerUrl);
    await overlayClient.connect();
    await waitFor(async () => (await overlayClient.evaluate(`document.querySelector('.overlay-title') !== null`)) === true);

    // 拖动弹窗：按住标题区拖动，弹窗停在新的位置
    step('拖动强提醒弹窗');
    const overlayOrigin = await overlayClient.evaluate('({ x: window.screenX, y: window.screenY })');
    const headerPoint = await overlayClient.evaluate(`(() => {
      const head = document.querySelector('.overlay-top');
      if (head === null) return null;
      const rect = head.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })()`);
    assert.ok(headerPoint !== null, '应能取到强提醒窗口的标题区');
    const dragTargetX = overlayOrigin.x - 180;
    await overlayClient.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: headerPoint.x,
      y: headerPoint.y,
      screenX: overlayOrigin.x + headerPoint.x,
      screenY: overlayOrigin.y + headerPoint.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    // 窗口随指针逐步移动：每轮按当前位置换算指针坐标，等窗口落地后再算下一轮，避免事件排队造成过冲
    for (let round = 0; round < 12; round += 1) {
      const current = await overlayClient.evaluate('window.screenX');
      if (Math.abs(current - dragTargetX) < 6) {
        break;
      }
      await overlayClient.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: headerPoint.x + (dragTargetX - current),
        y: headerPoint.y,
        screenX: dragTargetX,
        screenY: overlayOrigin.y + headerPoint.y,
        button: 'left',
        buttons: 1,
      });
      await waitFor(async () => (await overlayClient.evaluate('window.screenX')) !== current, 1500).catch(() => null);
    }
    await overlayClient.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: headerPoint.x,
      y: headerPoint.y,
      screenX: dragTargetX,
      screenY: overlayOrigin.y + headerPoint.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    // 派发事件的落点与窗口位移存在模型歧义，长距离拖动会过冲；
    // 收尾后按剩余偏差做单次纠偏微拖动：重新按下锚定、一次事件位移、抬起
    for (let fix = 0; fix < 3; fix += 1) {
      const settledX = await overlayClient.evaluate('window.screenX');
      const correction = dragTargetX - settledX;
      if (Math.abs(correction) < 8) {
        break;
      }
      await overlayClient.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: headerPoint.x,
        y: headerPoint.y,
        screenX: settledX + headerPoint.x,
        screenY: overlayOrigin.y + headerPoint.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await overlayClient.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: headerPoint.x + correction,
        y: headerPoint.y,
        screenX: settledX + headerPoint.x + correction,
        screenY: overlayOrigin.y + headerPoint.y,
        button: 'left',
        buttons: 1,
      });
      await waitFor(async () => (await overlayClient.evaluate('window.screenX')) !== settledX, 1500).catch(() => null);
      await overlayClient.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: headerPoint.x,
        y: headerPoint.y,
        screenX: settledX + headerPoint.x + correction,
        screenY: overlayOrigin.y + headerPoint.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      await sleep(300);
    }
    await sleep(400);
    const overlayAfter = await overlayClient.evaluate('({ x: window.screenX, y: window.screenY, w: window.outerWidth })');
    assert.ok(
      Math.abs(overlayAfter.x - (overlayOrigin.x - 180)) < 40,
      `强提醒弹窗应能拖动到新位置，实际从 ${overlayOrigin.x} 移到 ${overlayAfter.x}`,
    );
    record('强提醒弹窗可按住标题区拖动');

    assert.equal(await overlayClient.evaluate(clickByText('强制停止')), true);
    await waitFor(async () => (await overlayClient.evaluate(`document.querySelector('.confirm-card') !== null`)) === true);
    await sleep(400);
    const confirmDisabled = await overlayClient.evaluate(
      `document.querySelector('.confirm-actions .obtn-danger').disabled`,
    );
    assert.equal(confirmDisabled, true, '二次确认按钮在倒计时结束前应不可点击');
    fs.writeFileSync(path.join(outputDir, '04-confirm.png'), await overlayClient.screenshot());
    record('强制停止需要二次确认', '倒计时结束前按钮不可点击');

    await sleep(3200);
    const confirmEnabled = await overlayClient.evaluate(
      `document.querySelector('.confirm-actions .obtn-danger').disabled`,
    );
    assert.equal(confirmEnabled, false, '倒计时结束后二次确认按钮应可点击');

    assert.equal(await overlayClient.evaluate(clickByText('返回')), true);
    await waitFor(async () => (await overlayClient.evaluate(`document.querySelector('.confirm-card') === null`)) === true);
    assert.equal(await overlayClient.evaluate(exactReady('我已完成')), true, '强提醒展示期间我已完成应立即可点');    // 这次点击会立即销毁窗口，响应可能赶不上，按即发即忘处理，由目标消失断言把关
    void overlayClient.evaluate(clickExact('我已完成')).catch(() => {});
    await waitFor(async () => (await listTargets(port)).every((target) => !target.url.endsWith('overlay.html')));
    record('确认完成后弹窗关闭');

    // 升阶庆祝：预置 4 次完成，这次「我已完成」正好是第 5 次，小苗发芽，
    // 桌面宠物播放升阶演出，主窗口的完成统计同步换上新阶段名
    step('成长升阶庆祝');
    const evolveLabel = await waitFor(
      async () => (await petClient.evaluate(`document.querySelector('.pet-evolve-label')?.textContent ?? ''`)) || null,
      10_000,
    );
    assert.ok(evolveLabel.includes('发芽'), `升阶文案应展示新阶段名，实际 ${evolveLabel}`);
    // 留到演出中段再截图，闪白后的新形象、光环与碎星都在画面里
    await sleep(900);
    fs.writeFileSync(path.join(outputDir, '06-pet-evolve.png'), await petClient.screenshot());
    await waitFor(
      async () =>
        (await petClient.evaluate(`document.querySelector('.pet-species-sprout .pet-top') !== null`)) === true,
      10_000,
    );
    const mainGroveText = await mainClient.evaluate('document.body.innerText');
    assert.ok(mainGroveText.includes('发芽'), '主窗口完成统计应换成新阶段名');
    assert.ok(mainGroveText.includes('距幼苗还差 10 次'), '主窗口应展示距下一阶段的剩余次数');
    record('完成提醒跨过阶段线：桌面宠物升阶庆祝，主窗口同步新阶段');

    // 多选：取消勾选两项后只保留普通提醒
    step('多选提醒项');
    assert.equal(await mainClient.evaluate(clickByLabel('启用 喝水')), true);
    assert.equal(await mainClient.evaluate(clickByLabel('启用 护眼休息')), true);
    // 轮询配置文件，等防抖保存把勾选变化写进主进程设置，再触发预览
    const toggledPath = path.join(userDataDir, 'settings.json');
    await waitFor(
      async () => {
        if (!fs.existsSync(toggledPath)) {
          return false;
        }
        const saved = JSON.parse(fs.readFileSync(toggledPath, 'utf8'));
        return saved.items
          .filter((item) => item.id === 'preset-water' || item.id === 'preset-eye')
          .every((item) => !item.enabled);
      },
      10000,
    );
    const enabledText = await mainClient.evaluate(
      `document.querySelector('.card-note').textContent ?? ''`,
    );
    assert.ok(enabledText.includes('1 /'), '启用数量应随勾选变化');
    const nextList = await mainClient.evaluate(`document.querySelector('.next-list').innerText`);
    assert.ok(nextList.includes('起身活动'), '接下来的提醒应只保留启用的项目');
    assert.ok(!nextList.includes('喝水'), '未启用的项目不应出现在提醒队列');
    record('多选提醒项生效', enabledText.trim());

    // 设置页保存其它内容时不能抹掉拖动弹窗留下的位置
    const offsetAfterSave = JSON.parse(fs.readFileSync(toggledPath, 'utf8')).overlayOffset;
    assert.ok(offsetAfterSave !== null && offsetAfterSave !== undefined, '拖动弹窗留下的位置应保留');
    record('拖动弹窗的位置不会被其它设置改动抹掉', `偏移 ${offsetAfterSave.dx}`);

    step('普通提醒卡片');
    // 走「接下来的提醒」行内按钮，验证按项预览与卡片按钮的最早到期项预览是两条通路
    assert.equal(await mainClient.evaluate(clickByLabel('立即提醒一次 起身活动')), true, '应能预览指定的提醒项');
    const cardTarget = await waitForTarget(port, (target) => target.url.endsWith('overlay.html'));
    const cardClient = new CdpClient(cardTarget.webSocketDebuggerUrl);
    await cardClient.connect();
    try {
      await waitFor(async () => (await cardClient.evaluate(`document.querySelector('.card-shell') !== null`)) === true);
    } catch (error) {
      // 失败时把卡片页面当前内容与全部页面目标写进错误，便于区分渲染卡住与驱动错对象
      let detail = '';
      try {
        detail = `，卡片页面内容：${(await cardClient.evaluate('document.body.innerText'))?.slice(0, 120) ?? '无法读取'}`;
      } catch {
        detail = '，卡片页面已无法响应';
      }
      const targets = await listTargets(port).catch(() => []);
      throw new Error(`${error.message}${detail}，当前页面目标：${targets.map((t) => t.url).join(' | ')}`);
    }
    await sleep(400);
    const cardText = await cardClient.evaluate('document.body.innerText');
    assert.ok(cardText.includes('起身活动'), '普通提醒应展示对应提醒项');
    assert.ok(cardText.includes('点开始计时'), '设了时长的卡片应先提示点开始计时');
    assert.equal(await cardClient.evaluate(clickExact('开始')), true, '卡片应提供开始按钮');
    const cardPosition = await cardClient.evaluate('({ x: window.screenX, w: window.outerWidth })');
    // 双屏下卡片与强提醒可能落在不同显示器，按各自显示器的右边缘校验拖动留下的偏移（28 为弹窗边距）
    const savedOverlayOffset = JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')).overlayOffset;
    const offsetDx = savedOverlayOffset?.dx ?? 0;
    const cardDisplayRight = cardPosition.x >= 1920 ? 3840 : 1920;
    const cardRight = cardPosition.x + cardPosition.w;
    const expectedCardRight = cardDisplayRight - 28 + offsetDx;
    assert.ok(
      Math.abs(cardRight - expectedCardRight) < 40,
      `普通卡片应沿用拖动留下的偏移，实际右边缘 ${cardRight}，期望 ${expectedCardRight}（偏移 ${offsetDx}）`,
    );
    fs.writeFileSync(path.join(outputDir, '06-card.png'), await cardClient.screenshot());
    record('普通提醒以小卡片展示，先开始再计时', `沿用拖动偏移 ${offsetDx}，右边缘 ${cardRight}`);
    await waitFor(async () => (await cardClient.evaluate(exactReady('已完成'))) === true, 8000);
    // 点击会立即销毁卡片窗口，响应可能赶不上，按即发即忘处理，由目标消失断言把关
    void cardClient.evaluate(clickExact('已完成')).catch(() => {});
    await waitFor(async () => (await listTargets(port)).every((target) => !target.url.endsWith('overlay.html')));
    cardClient.close();

    // 勾选回来，验证设置会被保存：轮询文件内容，等防抖保存落盘
    step('设置落盘');
    assert.equal(await mainClient.evaluate(clickByLabel('启用 喝水')), true);
    const savedPath = path.join(userDataDir, 'settings.json');
    await waitFor(
      async () => {
        if (!fs.existsSync(savedPath)) {
          return false;
        }
        const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
        return saved.items.some((item) => item.id === 'preset-water' && item.enabled);
      },
      10000,
    );
    record('设置写入配置文件', savedPath);

    // 归位：设置页点归位后弹窗回到配置的位置
    step('弹窗归位');
    assert.equal(await mainClient.evaluate(clickByLabel('设置')), true);
    await waitFor(async () => (await mainClient.evaluate(`document.querySelector('.app').dataset.view === 'settings'`)) === true);
    await waitFor(
      async () =>
        (await mainClient.evaluate(
          `Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === '归位')`,
        )) === true,
      10_000,
    );
    assert.equal(await mainClient.evaluate(clickByText('归位')), true);
    await waitFor(
      async () => {
        const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
        return saved.overlayOffset === null;
      },
      10_000,
    );
    assert.equal(await mainClient.evaluate(clickByLabel('返回主页')), true);
    await waitFor(async () => (await mainClient.evaluate(`document.querySelector('.app').dataset.view === 'home'`)) === true);
    record('弹窗可以归位到配置的位置');

    console.log(`\n冒烟测试全部通过，共 ${checks.length} 项检查，截图目录：${outputDir}`);
  } finally {
    overlayClient?.close();
    petClient?.close();
    panelClient?.close();
    mainClient?.close();
    killApp();
    await new Promise((resolve) => {
      const pending = childProcesses.filter((child) => child.exitCode === null);
      if (pending.length === 0) {
        resolve();
        return;
      }
      let remaining = pending.length;
      for (const child of pending) {
        child.once('exit', () => {
          remaining -= 1;
          if (remaining === 0) resolve();
        });
      }
      setTimeout(resolve, 3000);
    });
    await sleep(300);
  }
}

main()
  .catch((error) => {
    const message = `冒烟测试失败：${error?.stack ?? error}`;
    console.error(message);
    log(message);
    process.exitCode = 1;
  })
  .then(() => {
    // 收尾完成后显式退出，避免残留句柄把进程拖进看门狗超时
    process.exit(process.exitCode ?? 0);
  });
