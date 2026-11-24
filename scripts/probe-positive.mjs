// 全屏探针正例验证：拉起一个覆盖整个屏幕的无边框窗口，探针应报告全屏矩形
import { readFileSync } from 'node:fs';
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

let probeScript = pick('SCRIPT');
probeScript = probeScript.replaceAll('${CSHARP.trim()}', pick('CSHARP').trim());
probeScript = probeScript.replaceAll('${TOLERANCE}', '4').replaceAll('${SAMPLE_INTERVAL_MS}', '1000');

const formScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public static class AnkoFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'
$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$f.Bounds = $b
$f.TopMost = $true
$f.Show()
[AnkoFg]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[AnkoFg]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 200
$fg = [AnkoFg]::GetForegroundWindow()
$procId = 0
$fgThread = [AnkoFg]::GetWindowThreadProcessId($fg, [ref]$procId)
$myThread = [AnkoFg]::GetCurrentThreadId()
[AnkoFg]::AttachThreadInput($myThread, $fgThread, $true) | Out-Null
[AnkoFg]::SetForegroundWindow($f.Handle) | Out-Null
[AnkoFg]::AttachThreadInput($myThread, $fgThread, $false) | Out-Null
Start-Sleep -Milliseconds 500
$nowFg = [AnkoFg]::GetForegroundWindow()
Write-Host ("FG_MATCH=" + ($nowFg -eq $f.Handle) + " form=" + $f.Handle + " fg=" + $nowFg)
$stop = [DateTime]::Now.AddSeconds(12)
while ([DateTime]::Now -lt $stop) {
  [AnkoFg]::SetForegroundWindow($f.Handle) | Out-Null
  [System.Windows.Forms.Application]::DoEvents()
  [System.Threading.Thread]::Sleep(200)
}
$f.Close()
`;

const form = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', formScript], { windowsHide: true });
form.stderr.on('data', (c) => process.stderr.write(`[form] ${c}`));
form.stdout.on('data', (c) => process.stderr.write(`[form-out] ${c}`));

setTimeout(() => {
  const probe = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', probeScript], { windowsHide: true });
  const lines = [];
  probe.stdout.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim() !== '') lines.push(line.trim());
    }
  });
  probe.stderr.on('data', (c) => process.stderr.write(`[probe] ${c}`));
  setTimeout(() => {
    console.log('probe lines:', JSON.stringify(lines));
    const hit = lines.some((l) => l.split(',').length === 4);
    console.log(hit ? '检测到全屏' : '未检测到全屏');
    probe.kill();
    form.kill();
    process.exit(hit ? 0 : 1);
  }, 6000);
}, 4000);
