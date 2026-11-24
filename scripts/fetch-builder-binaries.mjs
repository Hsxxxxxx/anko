import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const cacheRoot =
  process.env.ELECTRON_BUILDER_CACHE?.trim() ||
  path.join(process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? '', '.cache'), 'electron-builder', 'Cache');

// 与 app-builder-lib 的 toolsets/windows.js 及 toolsets/nsis.js 中的常量保持一致
const artifacts = [
  {
    dir: 'winCodeSign-2.6.0',
    file: 'winCodeSign-2.6.0.7z',
    sha256: 'cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4',
  },
  {
    dir: 'nsis-3.0.4.1',
    file: 'nsis-3.0.4.1.7z',
    sha256: '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa',
  },
  {
    dir: 'nsis-resources-3.4.1',
    file: 'nsis-resources-3.4.1.7z',
    sha256: '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103',
  },
  {
    dir: '7zip@1.0.0',
    file: '7zip-win-x64.tar.gz',
    sha256: 'be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3',
  },
];

function urlsFor(artifact) {
  return [
    `https://cdn.npmmirror.com/binaries/electron-builder-binaries/${artifact.dir}/${artifact.file}`,
    `https://github.com/electron-userland/electron-builder-binaries/releases/download/${artifact.dir}/${artifact.file}`,
  ];
}

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

async function probeTotal(downloadUrls) {
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

async function downloadChunk(downloadUrls, fileDescriptor, index, start, end) {
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

async function downloadArtifact(artifact) {
  const targetDir = path.join(cacheRoot, artifact.dir);
  const targetPath = path.join(targetDir, artifact.file);
  if (fs.existsSync(targetPath) && (await sha256OfFile(targetPath)) === artifact.sha256) {
    console.log(`已就绪 ${artifact.file}`);
    return;
  }
  const downloadUrls = urlsFor(artifact);
  const statePath = `${targetPath}.chunks.json`;
  const total = await probeTotal(downloadUrls);
  const chunkCount = Math.ceil(total / CHUNK_SIZE);
  let state = { completed: [] };
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }
  const completed = new Set(state.completed ?? []);
  console.log(`下载 ${artifact.file}，${(total / 1024 / 1024).toFixed(1)} MB，共 ${chunkCount} 块，已完成 ${completed.size} 块`);

  fs.mkdirSync(targetDir, { recursive: true });
  const fileDescriptor = fs.openSync(targetPath, fs.existsSync(targetPath) ? 'r+' : 'w+');
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
        await downloadChunk(downloadUrls, fileDescriptor, index, start, end);
        completed.add(index);
        state.completed = [...completed];
        fs.writeFileSync(statePath, JSON.stringify(state), 'utf8');
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  } finally {
    fs.closeSync(fileDescriptor);
  }

  const hash = await sha256OfFile(targetPath);
  if (hash !== artifact.sha256) {
    throw new Error(`${artifact.file} 校验不通过`);
  }
  fs.rmSync(statePath, { force: true });
  console.log(`校验通过 ${artifact.file}`);
}

applySystemProxy();
for (const artifact of artifacts) {
  await downloadArtifact(artifact);
}
console.log('构建工具集已就位');
