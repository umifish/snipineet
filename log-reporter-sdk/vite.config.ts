// vite.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts"; // 确保你已经安装了 vite-plugin-dts

export default defineConfig({
  plugins: [
    // 插件用于自动生成 TypeScript 类型声明文件
    dts({
      insertTypesEntry: true, // 确保生成一个入口类型文件
      outputDir: "dist", // 类型声明输出目录
      logDiagnostics: true,
      skipDiagnostics: false,
    }),
  ],
  build: {
    // 确保构建前清空输出目录
    emptyOutDir: true,

    // 启用库模式构建
    lib: {
      // 指向 SDK 的统一导出入口文件
      entry: resolve(__dirname, "src/index.ts"),

      // UMD 格式下的全局变量名
      name: "LogReporterSDK",

      // 定制输出文件名，以支持 .mjs 约定
      fileName: (format: string) => {
        if (format === "es") {
          // ES Module (Node.js 约定)
          return "log-reporter-sdk.mjs";
        }
        if (format === "cjs") {
          // CommonJS (Node.js require)
          return "log-reporter-sdk.cjs.js";
        }
        // UMD (浏览器全局/AMD)
        return `log-reporter-sdk.${format}.js`;
      },

      // 导出格式：ESM, UMD (含AMD), CJS
      formats: ["es", "umd", "cjs"],
    },

    // 配置 Rollup 选项（如果 SDK 仅依赖原生 API，这部分可保持注释或省略）
    /*
    rollupOptions: {
      // external: ['some-dependency'], // 如果有外部依赖，在这里列出
    },
    */
  },
});
