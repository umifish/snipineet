// 定义一个类型，表示所有 console 方法的签名
type ConsoleMethod = (...args: any[]) => void;

// 存储原始的 console 方法
const originalConsole: { [key: string]: ConsoleMethod | undefined } = {};

/**
 * 🛠️ 优化点 2: 安全地获取 localStorage 中的日志状态，处理访问错误和非浏览器环境。
 */
function getLogStatus(key: string, value: string): boolean {
  // 检查是否在浏览器环境且 window.localStorage 可用
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    // 尝试安全地读取 localStorage
    return window.localStorage.getItem(key) === value;
  } catch (e) {
    // 捕获可能发生的 SecurityError 或其他存储访问错误
    // 注意：这里使用原生的 console.error，确保即使重写失败也能输出
    console.error("[Debug Logger] 无法安全访问 localStorage:", e);
    return false;
  }
}

/**
 * 备份原始的 console 方法。
 */
function backupOriginalMethods(): string[] {
  const methodsToOverride = ["log", "info", "warn", "error", "debug", "dir"];

  if (typeof window === "undefined" || !window.console) return [];

  methodsToOverride.forEach((methodName) => {
    // 使用类型断言访问 console 上的方法
    const originalMethod = (window.console as any)[methodName] as
      | ConsoleMethod
      | undefined;

    if (originalMethod) {
      originalConsole[methodName] = originalMethod;
    }
  });

  return Object.keys(originalConsole);
}

/**
 * 根据 localStorage 中的某个 Key/Value 来启用或禁用 console 输出。
 * * @param localStorageKey 用于判断是否启用日志的 localStorage key 名称。
 * @param enableValue 当 localStorage 中的值为这个字符串时，启用日志输出。
 */
export function initDebugLogger(
  localStorageKey: string = "DEBUG_LOGS_ENABLED",
  enableValue: string = "true"
): void {
  const overrideMethods = backupOriginalMethods();

  if (overrideMethods.length === 0) return;

  // 获取日志启用状态（使用优化后的安全函数）
  const isLoggingEnabled = getLogStatus(localStorageKey, enableValue);

  overrideMethods.forEach((methodName) => {
    const originalMethod = originalConsole[methodName];
    if (!originalMethod) return;

    // 定义新的方法：启用时调用原始方法并绑定上下文，禁用时为空函数
    const newMethod: ConsoleMethod = isLoggingEnabled
      ? function (...args: any[]): void {
          // 确保 this 上下文绑定到 console
          originalMethod.apply(window.console, args);
        }
      : function (...args: any[]): void {
          // 空函数 (No-Op)
        };

    // 🛠️ 优化点 1: 使用 Object.defineProperty 尝试安全地重写 console 属性
    try {
      Object.defineProperty(window.console, methodName, {
        value: newMethod,
        writable: true, // 允许它被后续的 initDebugLogger 调用再次覆盖
        configurable: true, // 允许删除或更改属性
      });
    } catch (e) {
      // 如果 Object.defineProperty 失败（例如在受限环境或旧浏览器中），回退到直接赋值
      (window.console as any)[methodName] = newMethod;
    }
  });

  // --- 启动日志提示（使用原始 log 方法输出，不被重写影响） ---
  // 再次确保原始 log 存在，以便输出提示
  const originalLog = originalConsole["log"] || (() => {});

  if (isLoggingEnabled) {
    originalLog.call(
      window.console,
      `%c✅ Debug Logs Enabled`,
      "color: green; font-weight: bold;"
    );
    originalLog.call(
      window.console,
      `Logging controlled by localStorage key: "${localStorageKey}"`
    );
  } else {
    originalLog.call(
      window.console,
      `%c❌ Debug Logs Disabled`,
      "color: orange; font-weight: bold;"
    );
    originalLog.call(
      window.console,
      `Set localStorage key "${localStorageKey}" to "${enableValue}" and refresh to enable.`
    );
  }
}

/**
 * 允许在运行时手动重新检查 localStorage 并切换日志状态。
 */
export function toggleDebugLogger(): void {
  initDebugLogger();
}
