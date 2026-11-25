// 一键发布：推送 main 分支，并把 release/ 下的构建产物同步到 v1.0.0 Release（同名资产替换，大小一致跳过）
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';

const REPO = 'Hsxxxxxx/anko';
const TAG = 'v1.0.0';
const PROXY_PORT = 31181;
// release/ 下本地文件名与 Release 资产名的对应关系
const ASSET_MAP = [
  { local: 'anko-1.0.0-android.apk', asset: 'anko-1.0.0-android.apk' },
  { local: '安叩-1.0.0-安装包.exe', asset: 'anko-1.0.0-setup.exe' },
  { local: '安叩-1.0.0-单文件绿色版.exe', asset: 'anko-1.0.0-portable.exe' },
  { local: '安叩-1.0.0-绿色版.zip', asset: 'anko-1.0.0-win-x64.zip' },
];

const root = resolve(import.meta.dirname, '..');

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (output.length > 0) {
    console.log(output);
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} 退出码 ${result.status}`);
  }
  return result.stdout ?? '';
}

function proxyAvailable() {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port: PROXY_PORT, timeout: 800 });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      done(false);
    });
    socket.once('error', () => {
      socket.destroy();
      done(false);
    });
  });
}

let token = '';

async function api(method, url, body) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'anko-publish',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/octet-stream';
  }
  const response = await fetch(url, { method, headers, body });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${method} ${url} 返回 HTTP ${response.status}：${text}`.trim());
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

// 1) 推送 main 分支；本机代理存活时走代理
const useProxy = await proxyAvailable();
const proxyArgs = useProxy
  ? ['-c', `http.proxy=http://127.0.0.1:${PROXY_PORT}`, '-c', `https.proxy=http://127.0.0.1:${PROXY_PORT}`]
  : [];
console.log('== 推送 git ==');
git([...proxyArgs, '-c', 'credential.helper=wincred', 'push', 'origin', 'main']);
console.log('推送完成');

// 2) 从凭据库取 GitHub token
const cred = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
});
token = (cred.stdout ?? '')
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line.startsWith('password='))
  ?.slice('password='.length);
if (!token) {
  throw new Error('凭据库取不到 GitHub token');
}

// 3) 找 v1.0.0 Release
const releases = await api('GET', `https://api.github.com/repos/${REPO}/releases?per_page=30`);
const release = releases.find((entry) => entry.tag_name === TAG);
if (!release) {
  throw new Error(`找不到 ${TAG} Release`);
}

// 4) 同步本地产物：本地缺失跳过（只构建过部分平台时），资产大小一致跳过，否则删除后重传
const releaseDir = join(root, 'release');
for (const { local, asset: assetName } of ASSET_MAP) {
  const localPath = join(releaseDir, local);
  if (!existsSync(localPath)) {
    console.log(`跳过 ${assetName}（本地没有 ${local}）`);
    continue;
  }
  const bytes = readFileSync(localPath);
  const existing = release.assets.find((entry) => entry.name === assetName);
  if (existing && existing.size === bytes.length) {
    console.log(`跳过 ${assetName}（大小一致）`);
    continue;
  }
  if (existing) {
    await api('DELETE', `https://api.github.com/repos/${REPO}/releases/assets/${existing.id}`);
    console.log(`已删除旧资产 ${assetName}`);
  }
  await api(
    'POST',
    `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
    bytes,
  );
  console.log(`已上传 ${assetName}（${bytes.length} 字节）`);
}

// 5) 输出最终资产列表
const finalRelease = await api('GET', `https://api.github.com/repos/${REPO}/releases/${release.id}`);
for (const asset of finalRelease.assets) {
  console.log(`资产 ${asset.name} ${asset.size} 字节，${asset.download_count} 次下载`);
}
console.log('发布完成');
