/**
 * GlobalUtils.ts
 * 包含处理 window 全局对象和跨 iframe 访问的工具函数。
 */

import { GLOBAL_KEY } from "./constants";
import type { LogReporter } from "./LogReporter"; // 导入 LogReporter 类型

/**
 * 向上循环查找并返回能够安全访问的最高层 window 对象。
 * @returns 能够安全访问的最高层 window 对象。
 */
export function getTopAccessibleWindow(): Window {
  if (typeof window === "undefined") {
    return globalThis as unknown as Window;
  }

  let currentWindow: Window = window;
  let topAccessibleWindow: Window = window;

  // 向上循环查找 (逻辑保持不变)
  while (currentWindow !== currentWindow.parent) {
    try {
      if (currentWindow.parent.location.host) {
        topAccessibleWindow = currentWindow.parent;
        currentWindow = currentWindow.parent;
      } else {
        break;
      }
    } catch (e) {
      // 捕获跨域安全错误
      break;
    }
  }

  return topAccessibleWindow;
}

/**
 * 在微前端或 Iframe 场景中，安全地尝试从最高层可访问的 window 上获取 LogReporter 实例。
 * @returns LogReporter 实例，如果找到；否则返回 null。
 */
export function getTopMountedReporterInstance(): LogReporter | null {
  if (typeof window === "undefined") {
    return null;
  }

  const topAccessibleWindow = getTopAccessibleWindow();

  try {
    // 使用类型安全的访问方式
    const instance = (topAccessibleWindow as Window)[GLOBAL_KEY];

    if (instance) {
      console.log(
        `LogReporter: 成功从顶层可访问窗口获取到已挂载的实例 (Key: ${GLOBAL_KEY})。`
      );
      return instance;
    }
  } catch (e) {
    console.warn("LogReporter: 尝试访问顶层挂载的实例时发生错误。", e);
  }

  return null;
}
