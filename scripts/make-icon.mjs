import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'build');

const BELL = [14, 124, 116]; // 铃铛描边，与主界面主题青一致
const TINT = [201, 231, 222]; // 铃铛内部的淡青填充，小尺寸下保持可辨

// 涟漪圆环：中心向外交替的浅色带
const RING_CENTER = [0.5, 0.46];
const RING_BANDS = [
  [0.205, [211, 233, 223]],
  [0.275, [224, 241, 233]],
  [0.345, [216, 236, 227]],
  [0.415, [228, 243, 236]],
  [0.485, [218, 238, 230]],
];
const BASE = [233, 245, 240];

// 圆角从“方正”过渡到“正圆”的档位数，与主进程 shared/icon.ts 的 ICON_STAGES 保持一致
const STAGES = 9;
const RADIUS_START = 0.16; // 最方正的圆角
const RADIUS_FULL = 0.5; // 正圆

function radiusForStage(stage) {
  const p = stage / (STAGES - 1);
  return RADIUS_START + (RADIUS_FULL - RADIUS_START) * p;
}

/** 圆角方块的有符号距离，正数表示在外部 */
function shapeOutside(x, y, size, radius) {
  const inset = size * 0.05;
  const half = size / 2 - inset;
  const dx = Math.abs(x - size / 2) - (half - radius);
  const dy = Math.abs(y - size / 2) - (half - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** 三角形内点判定 */
function insideTriangle(px, py, a, b, c) {
  const sign = (p1x, p1y, p2x, p2y) => (p1x - px) * (p2y - py) - (p2x - px) * (p1y - py);
  const d1 = sign(a[0], a[1], b[0], b[1]);
  const d2 = sign(b[0], b[1], c[0], c[1]);
  const d3 = sign(c[0], c[1], a[0], a[1]);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

/** 点到线段距离 */
function distSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function ringColor(x, y, size) {
  const r = Math.hypot(x - RING_CENTER[0] * size, y - RING_CENTER[1] * size) / size;
  for (const [limit, color] of RING_BANDS) {
    if (r < limit) {
      return color;
    }
  }
  return BASE;
}

/** 铃铛实心轮廓（顶环 + 穹顶 + 裙摆 + 底沿 + 铃舌）的内部 */
function insideBellSilhouette(x, y, size) {
  if (Math.hypot(x - 0.5 * size, y - 0.445 * size) <= 0.135 * size) {
    return true;
  }
  // 裙摆梯形拆成两个三角形
  if (insideTriangle(x, y, [0.3767 * size, 0.5 * size], [0.6233 * size, 0.5 * size], [0.695 * size, 0.588 * size])) {
    return true;
  }
  if (insideTriangle(x, y, [0.3767 * size, 0.5 * size], [0.695 * size, 0.588 * size], [0.305 * size, 0.588 * size])) {
    return true;
  }
  if (x >= 0.288 * size && x <= 0.712 * size && y >= 0.582 * size && y <= 0.63 * size) {
    return true;
  }
  return Math.hypot(x - 0.5 * size, y - 0.662 * size) <= 0.034 * size;
}

/** 铃铛的描边线：顶环、穹顶弧、两侧裙摆、底沿，以及实心的铃舌 */
function insideBellOutline(x, y, size) {
  const stroke = 0.013 * size;
  // 顶部挂环
  if (Math.abs(Math.hypot(x - 0.5 * size, y - 0.252 * size) - 0.04 * size) <= stroke) {
    return true;
  }
  // 穹顶圆环，只取上半段，下半交给裙摆
  if (y <= 0.505 * size && Math.abs(Math.hypot(x - 0.5 * size, y - 0.445 * size) - 0.135 * size) <= stroke) {
    return true;
  }
  // 两侧外扩的裙摆
  if (distSegment(x, y, 0.378 * size, 0.5 * size, 0.305 * size, 0.588 * size) <= stroke) {
    return true;
  }
  if (distSegment(x, y, 0.622 * size, 0.5 * size, 0.695 * size, 0.588 * size) <= stroke) {
    return true;
  }
  // 底沿
  if (distSegment(x, y, 0.288 * size, 0.606 * size, 0.712 * size, 0.606 * size) <= 0.015 * size) {
    return true;
  }
  // 铃舌
  return Math.hypot(x - 0.5 * size, y - 0.662 * size) <= 0.034 * size;
}

/** 返回采样点颜色，null 表示透明 */
function sampleColor(x, y, size, radius) {
  if (shapeOutside(x, y, size, radius) > 0) {
    return null;
  }
  let color = ringColor(x, y, size);
  if (insideBellSilhouette(x, y, size)) {
    color = TINT;
  }
  if (insideBellOutline(x, y, size)) {
    color = BELL;
  }
  return color;
}

function render(size, radius) {
  const png = new PNG({ width: size, height: size });
  const samples = 4;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = px + (sx + 0.5) / samples;
          const y = py + (sy + 0.5) / samples;
          const color = sampleColor(x, y, size, radius);
          if (color === null) {
            continue;
          }
          red += color[0];
          green += color[1];
          blue += color[2];
          alpha += 255;
        }
      }
      const total = samples * samples;
      const index = (size * py + px) << 2;
      const covered = alpha / 255;
      png.data[index] = covered === 0 ? 0 : Math.round(red / covered);
      png.data[index + 1] = covered === 0 ? 0 : Math.round(green / covered);
      png.data[index + 2] = covered === 0 ? 0 : Math.round(blue / covered);
      png.data[index + 3] = Math.round(alpha / total);
    }
  }
  return PNG.sync.write(png);
}

fs.mkdirSync(outputDir, { recursive: true });
// 运行期用的档位图标：256px，托盘与主窗口共用
for (let stage = 0; stage < STAGES; stage += 1) {
  const file = path.join(outputDir, `icon-stage-${stage}.png`);
  fs.writeFileSync(file, render(256, radiusForStage(stage)));
  console.log(`已生成 ${path.relative(root, file)}`);
}
// 安装包与桌面快捷方式用的静态图标：512px，取最方正的一档
const exeFile = path.join(outputDir, 'icon.png');
fs.writeFileSync(exeFile, render(512, RADIUS_START));
console.log(`已生成 ${path.relative(root, exeFile)}`);
