import { app } from 'electron';
import path from 'node:path';

/** 打包后资源放在 resources 目录，开发时放在工程的 build 目录 */
export function resourcePath(name: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, name);
  }
  return path.join(__dirname, '../../build', name);
}
