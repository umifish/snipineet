/**
 * LogSingleton.ts
 * SDK 主入口。负责 LogReporter 的单例模式管理、创建、销毁和全局挂载。
 * 实现了：优先获取顶层实例，否则创建本地单例。
 */

import { LogReporter } from "./LogReporter";
import type { LogReporterConfig } from "./LogTypes";
import {
  getTopAccessibleWindow,
  getTopMountedReporterInstance,
} from "./GlobalUtils";
import { LogBuilder } from "./LogBuilder";
import { GLOBAL_KEY } from "./Constants";

let reporterInstance: LogReporter | null = null;

/**
 * 销毁当前的 LogReporter 实例，并允许重新创建。
 */
export function destroyLogReporterInstance(): void {
  if (reporterInstance) {
    reporterInstance.destroy();
    reporterInstance = null;
    unmountReporterFromTop();
  }
}

/**
 * 获取 LogReporter 的单例实例。
 * 逻辑：
 * 1. 尝试从顶层可访问窗口获取已挂载的实例（微前端场景）。
 * 2. 如果失败，则使用本地单例模式。
 * 3. 如果 mountToTop 为 true，则将最终返回的实例挂载到顶层。
 * * @param config 用于初始化或重新配置 LogReporter 的配置。
 * @param mountToTop 是否尝试将实例挂载到可访问的顶层窗口上。
 * @returns LogReporter 实例 (可能是顶层实例或本地单例)。
 */
export function getLogReporterInstance(
  config: Partial<LogReporterConfig> = {},
  mountToTop: boolean = false
): LogReporter {
  // 步骤 1：优先尝试从顶层获取实例 (微前端兼容)
  const topInstance = getTopMountedReporterInstance();
  if (topInstance) {
    return topInstance;
  }

  // 步骤 2：如果顶层没有找到，则走本地单例模式
  if (reporterInstance === null) {
    reporterInstance = new LogReporter(config);
  }

  // 步骤 3：如果要求挂载，则挂载本地实例
  if (mountToTop) {
    mountReporterToTop(reporterInstance);
  }

  return reporterInstance;
}

/**
 * 将 LogReporter 实例挂载到找到的最高层可访问窗口上。
 * @param instance LogReporter 实例
 */
function mountReporterToTop(instance: LogReporter): void {
  const topAccessibleWindow = getTopAccessibleWindow();

  try {
    if (!(topAccessibleWindow as Window)[GLOBAL_KEY]) {
      (topAccessibleWindow as Window)[GLOBAL_KEY] = instance;
      console.log(
        `LogReporter: 实例已成功挂载到顶层可访问窗口的 ${GLOBAL_KEY} 属性上。`
      );
    }
  } catch (e) {
    console.warn("LogReporter: 无法将实例挂载到顶层可访问窗口。", e);
  }
}

/**
 * 从顶层可访问窗口移除 LogReporter 实例。
 */
function unmountReporterFromTop(): void {
  const topAccessibleWindow = getTopAccessibleWindow();

  try {
    if ((topAccessibleWindow as Window)[GLOBAL_KEY]) {
      // 需要使用 delete 关键字移除属性，这里断言为 any 保持兼容性
      delete (topAccessibleWindow as any)[GLOBAL_KEY];
      console.log(
        `LogReporter: 实例已从顶层可访问窗口的 ${GLOBAL_KEY} 属性移除。`
      );
    }
  } catch (e) {
    console.warn("LogReporter: 无法从顶层可访问窗口移除实例。", e);
  }
}

// 导出 LogReporter 类和 LogBuilder 类，方便用户进行类型推断和直接实例化 LogBuilder
export { LogReporter, LogBuilder };

// 将核心单例函数作为默认导出
export default getLogReporterInstance;
