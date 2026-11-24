import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const version = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8')).version;
const artifact = `electron-v${version}-win32-x64.zip`;
const expected = JSON.parse(fs.readFileSync(path.join(electronDir, 'checksums.json'), 'utf8'))[artifact];

const downloadUrls = [
  `https://cdn.npmmirror.com/binaries/electron/v${version}/${artifact}`,
  `https://github.com/electron/electron/releases/download/v${version}/${artifact}`,
];

const cacheRoot = path.join(
  process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? '', '.cache'),
  'electron',
  'Cache',
);
const normalized = new URL(downloadUrls[1]);
normalized.hash = '';
normalized.search = '';
normalized.pathname = path.posix.dirname(normalized.pathname);
const cacheDir = path.join(
  cacheRoot,
  crypto.createHash('sha256').update(normalized.toString()).digest('hex'),
);
const cachePath = path.join(cacheDir, artifact);
const statePath = `${cachePath}.chunks.json`;

const CHUNK_SIZE = 512 * 1024;
const CONCURRENCY = 4;
const CHUNK_RETRY = 200;

/** 读取 Windows 系统代理，让 Node 与浏览器走同一条链路 */
function applySystemProxy() {
  if (process.env.HTTPS_PROXY !== undefined || process.env.HTTP_PROXY !== undefined) {
    return;
  }
  let output = '';
  try {
    output = execFileSync(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyServer',
      ],
      { encoding: 'utf8' },
    );
  } catch {
    return;
  }
  const match = /ProxyServer\s+REG_SZ\s+(.+)/.exec(output);
  if (match === null) {
    return;
  }
  const raw = match[1].trim();
  const url = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : raw;
  if (!url.startsWith('http')) {
    return;
  }
  process.env.HTTPS_PROXY = url;
  process.env.HTTP_PROXY = url;
  console.log(`使用系统代理 ${url}`);
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function openRange(url, start, end) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (response.status !== 206) {
      throw new Error(`分块请求返回状态 ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function probeTotal() {
  for (const url of downloadUrls) {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        const response = await openRange(url, 0, 0);
        const contentRange = response.headers.get('content-range') ?? '';
        await response.body.cancel();
        const total = Number(contentRange.split('/')[1]);
        if (Number.isFinite(total) && total > 0) {
          return total;
        }
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error('无法获取压缩包大小');
}

async function downloadChunk(fileDescriptor, index, start, end) {
  let written = 0;
  for (let attempt = 1; attempt <= CHUNK_RETRY; attempt += 1) {
    const url = downloadUrls[(index + attempt) % downloadUrls.length];
    try {
      const response = await openRange(url, start + written, end);
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await new Promise((resolve, reject) => {
          fs.write(fileDescriptor, value, 0, value.length, start + written, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        written += value.length;
      }
      if (written !== end - start + 1) {
        throw new Error(`分块长度不符，期望 ${end - start + 1} 实际 ${written}`);
      }
      return;
    } catch (error) {
      if (attempt % 20 === 0) {
        console.log(`分块 ${index} 第 ${attempt} 次中断：${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`分块 ${index} 重试次数用尽`);
}

function loadState() {
  if (!fs.existsSync(statePath)) {
    return { completed: [] };
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state), 'utf8');
}

async function download() {
  fs.mkdirSync(cacheDir, { recursive: true });
  if (fs.existsSync(cachePath) && (await sha256OfFile(cachePath)) === expected) {
    console.log('压缩包已就绪，跳过下载');
    return;
  }

  const total = await probeTotal();
  const chunkCount = Math.ceil(total / CHUNK_SIZE);
  const state = loadState();
  const completed = new Set(state.completed ?? []);
  console.log(
    `压缩包 ${(total / 1024 / 1024).toFixed(1)} MB，共 ${chunkCount} 块，已完成 ${completed.size} 块`,
  );

  const fileDescriptor = fs.openSync(cachePath, fs.existsSync(cachePath) ? 'r+' : 'w+');
  try {
    let next = 0;
    const worker = async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= chunkCount) {
          return;
        }
        if (completed.has(index)) {
          continue;
        }
        const start = index * CHUNK_SIZE;
        const end = Math.min(total - 1, start + CHUNK_SIZE - 1);
        await downloadChunk(fileDescriptor, index, start, end);
        completed.add(index);
        state.completed = [...completed];
        saveState(state);
        if (completed.size % 20 === 0) {
          console.log(`已完成 ${completed.size}/${chunkCount} 块`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  } finally {
    fs.closeSync(fileDescriptor);
  }

  const hash = await sha256OfFile(cachePath);
  if (hash !== expected) {
    throw new Error('压缩包校验不通过');
  }
  console.log('压缩包校验通过');
}

async function extract() {
  const { extract } = require('@electron-internal/extract-zip');
  const distDir = path.join(electronDir, 'dist');
  fs.rmSync(distDir, { recursive: true, force: true });
  await extract(cachePath, { dir: distDir });
  const typeDefinition = path.join(distDir, 'electron.d.ts');
  if (fs.existsSync(typeDefinition)) {
    fs.renameSync(typeDefinition, path.join(electronDir, 'electron.d.ts'));
  }
  fs.writeFileSync(path.join(electronDir, 'path.txt'), 'electron.exe', 'utf8');
  console.log('运行时已解包到 node_modules/electron/dist');
}

applySystemProxy();
await download();
await extract();
