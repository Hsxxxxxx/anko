import { defineConfig } from 'vite';

export default defineConfig({
  // 渲染层根目录，两扇页面分别输出为 dist/renderer/main.html 与 overlay.html
  root: 'src/renderer',
  // 打包后通过 file 协议加载页面，资源路径必须是相对路径
  base: './',
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: false,
    target: 'chrome130',
    rollupOptions: {
      // 入口按工程目录解析，产物文件名按渲染层根目录计算
      input: {
        main: 'src/renderer/main.html',
        overlay: 'src/renderer/overlay.html',
        pet: 'src/renderer/pet.html',
        panel: 'src/renderer/panel.html',
      },
    },
  },
  server: {
    port: 5178,
    strictPort: true,
  },
});
