// vite.config.js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createSvgIconsPlugin } from "vite-plugin-svg-icons";
import path from "path";

// 获取绝对路径的辅助函数
const pathResolve = (dir) => path.resolve(__dirname, dir);

export default defineConfig({
  plugins: [
    vue(),
    createSvgIconsPlugin({
      // 1. 指定 SVG 文件的存放目录
      iconDirs: [pathResolve("src/assets/icons")],
      // 2. 指定生成的 Symbol ID 格式（组件中会用此格式来引用）
      //    例如：home.svg 将生成 ID 为 #icon-home
      symbolId: "icon-[name]",
    }),
  ],
  resolve: {
    alias: {
      "@": pathResolve("src"),
    },
  },
});
