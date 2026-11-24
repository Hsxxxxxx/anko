// 从 fullscreen.ts 源码提取探针脚本，独立跑几秒验证 PowerShell 探针能正常输出
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '../src/main/fullscreen.ts'), 'utf8');

const pick = (name) => {
  const marker = `const ${name} = \``;
  const start = src.indexOf(marker);
  const bodyStart = start + marker.length;
  const bodyEnd = src.indexOf('`;', bodyStart);
  return src.slice(bodyStart, bodyEnd);
};

let script = pick('SCRIPT');
script = script.replaceAll('${CSHARP.trim()}', pick('CSHARP').trim());
script = script.replaceAll('${TOLERANCE}', '4').replaceAll('${SAMPLE_INTERVAL_MS}', '1000');

const outDir = path.join(here, '../.smokeout');
mkdirSync(outDir, { recursive: true });
const psPath = path.join(outDir, 'probe-test.ps1');
writeFileSync(psPath, script, 'utf8');
console.log('wrote', psPath);

const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
const lines = [];
child.stdout.on('data', (chunk) => {
  for (const line of chunk.toString('utf8').split('\n')) {
    if (line.trim() !== '') lines.push(line.trim());
  }
});
child.stderr.on('data', (chunk) => process.stderr.write(`[ps] ${chunk}`));
setTimeout(() => {
  console.log('lines:', JSON.stringify(lines));
  child.kill();
  process.exit(lines.length >= 3 ? 0 : 1);
}, 6000);
