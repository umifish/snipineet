/**
 * index.ts
 * 统一导出 SDK 的公共 API。
 * 这是打包工具（如 Vite, Webpack）应该指向的入口文件。
 */

// 1. 核心单例/工厂函数（默认导出）
import getLogReporterInstance, {
  LogReporter,
  LogBuilder,
  destroyLogReporterInstance,
} from "./LogSingleton";

// 2. 导出所有核心类和函数
export default getLogReporterInstance;
export {
  LogReporter,
  LogBuilder,
  destroyLogReporterInstance,
  getLogReporterInstance,
};

// 3. 导出所有公共类型，方便用户在自己的项目中使用
export * from "./LogTypes";

// 4. (可选) 导出时钟同步器，如果用户需要手动控制时间同步
// import { TimeSynchronizer } from './TimeSynchronizer';
// export { TimeSynchronizer };
