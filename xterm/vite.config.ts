import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import path, { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [vue()],
  // === 核心修复配置 ===
  build: {
    rollupOptions: {
      // 告诉 Rollup 不要对 Xterm 包进行过度优化
      // 必须保留这些包的 Side Effects (副作用)，否则 Canvas 渲染代码会被移除。
      treeshake: {
        moduleSideEffects: [
          // 'xterm',          // Xterm 核心包 (包含 Canvas 渲染器)
          // 'xterm-addon-fit' // Fit Addon
          // 如果还使用了 WebglAddon，也应添加 'xterm-addon-webgl'
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(new URL("src", import.meta.url).pathname),
    },
  },
})


