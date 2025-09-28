// vite.config.js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import svgLoader from "vite-svg-loader"; // 引入新的 Loader

export default defineConfig({
  plugins: [
    vue(),
    // 启用 SVG Loader
    svgLoader({
      // 可选配置：移除 SVG 内部的 width/height 属性，方便我们用 CSS/Props 控制
      svgoConfig: {
        plugins: [{ name: "removeAttrs", params: { attrs: "(width|height)" } }],
      },
    }),
  ],
});
