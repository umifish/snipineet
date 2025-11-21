import { defineStore } from "pinia";
import { ref, computed } from "vue";

// 定义日志项接口
export interface LogItem {
  id: string; // 唯一的日志 ID
  timestamp: number;
  userId: string;
  serviceName: string;
  level: string;
  message: string;
  formattedMsg: string;
}

// --- 模拟 API 调用 ---

function formatLogMessage(
  timestamp: number,
  serviceName: string,
  userId: string,
  level: string,
  message: string
): string {
  const timeStr = new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
  });

  // 颜色代码定义
  const colors = {
    INFO: "\x1b[32m", // Green
    WARN: "\x1b[33m", // Yellow
    ERROR: "\x1b[31m", // Red
    DEBUG: "\x1b[36m", // Cyan
    RESET: "\x1b[0m",
    GRAY: "\x1b[90m",
    BOLD: "\x1b[1m",
  };

  const levelColor = colors[level as keyof typeof colors] || colors.RESET;

  return (
    `${colors.GRAY}${timeStr.padEnd(10)}\x1b[0m ` +
    `${colors.BOLD}\x1b[35m${serviceName.padEnd(14)}\x1b[0m ` +
    `${colors.BOLD}\x1b[36m${userId.padEnd(14)}\x1b[0m ` +
    `${levelColor}${level.padEnd(7)}${colors.RESET} ` +
    `${message}`
  );
}

// 模拟轮询 API 调用，返回带有 ID 的日志数据和绝对总数
function mockFetchLogs(isPolling = true): {
  logs: LogItem[];
  absoluteTotalCount: number;
} {
  const NOW = Date.now();
  const mockUsers = ["user_a", "user_b", "admin"];
  const mockServices = ["AuthService", "Gateway", "OrderProcessor"];
  const mockLevels = ["INFO", "WARN", "ERROR", "DEBUG"];

  const count = Math.floor(Math.random() * 11) + 5;
  const newLogs: LogItem[] = [];

  for (let i = 0; i < count; i++) {
    const timeOffset = Math.floor(Math.random() * 5000);
    const timestamp = NOW - timeOffset;
    const userId = mockUsers[Math.floor(Math.random() * mockUsers.length)];
    const serviceName =
      mockServices[Math.floor(Math.random() * mockServices.length)];
    const level = mockLevels[Math.floor(Math.random() * mockLevels.length)];
    const message = `[Request ${Math.floor(
      Math.random() * 1000
    )}] Operation completed successfully. Data size: ${Math.floor(
      Math.random() * 1024
    )} bytes.`;

    const id = `LIVE-${timestamp}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    newLogs.push({
      id,
      timestamp,
      userId,
      serviceName,
      level,
      message,
      formattedMsg: formatLogMessage(
        timestamp,
        serviceName,
        userId,
        level,
        message
      ),
    });
  }

  newLogs.sort((a, b) => a.timestamp - b.timestamp);

  // 假设后端总共有 20000 条日志，用于计算差距
  const absoluteTotalCount = 20000;
  return { logs: newLogs, absoluteTotalCount };
}

// 模拟历史 API 调用
function mockFetchOlderLogs(beforeTimestamp: number): {
  logs: LogItem[];
  hasMore: boolean;
} {
  console.log(
    `[API] 正在请求时间戳小于 ${new Date(
      beforeTimestamp
    ).toLocaleTimeString()} 的旧日志...`
  );

  const count = 10;
  const newLogs: LogItem[] = [];
  const baseTime = beforeTimestamp - 1000 * 60;

  for (let i = 0; i < count; i++) {
    const timestamp = baseTime - i * 1000;
    const userId = ["hist_user", "old_admin"][i % 2];
    const level = "DEBUG";
    const serviceName = "Archive";
    const message = `[History Log] Data from deep past. Index: ${i}`;

    const id = `HIST-${timestamp}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    newLogs.push({
      id,
      timestamp,
      userId,
      serviceName,
      level,
      message,
      formattedMsg: formatLogMessage(
        timestamp,
        serviceName,
        userId,
        level,
        message
      ),
    });
  }

  // 假设当 beforeTimestamp 足够小（例如小于某个阈值）时，就没有更多历史了
  const hasMore = beforeTimestamp > Date.now() - 6000000;

  newLogs.sort((a, b) => a.timestamp - b.timestamp);

  return { logs: newLogs, hasMore };
}

// --- Pinia Store 定义 ---
export const useLogStore = defineStore("logStorexxxxxx", () => {
  // 使用 Map 进行存储
  const logsMap = ref(new Map<string, LogItem>());

  // 缓存大小限制
  const TERMINAL_SIZE = 2000;

  // --- 新增状态用于历史加载和绝对计数 ---
  const isFetchingHistory = ref(false);
  const hasMoreHistory = ref(true);
  const absoluteTotalCount = ref(0); // 跟踪后端总日志量
  // ----------------------------

  // 计算属性：总日志条数 (当前缓存大小)
  const totalCount = computed(() => logsMap.value.size);

  // 计算属性：返回按时间排序的日志数组（用于渲染）
  const sortedLogs = computed(() => {
    const logArray = Array.from(logsMap.value.values());
    logArray.sort((a, b) => a.timestamp - b.timestamp);
    return logArray;
  });

  // 计算属性：获取当前缓存中最旧日志的时间戳
  const oldestLogTimestamp = computed(() => {
    const logs = sortedLogs.value;
    return logs.length > 0 ? logs[0].timestamp : Date.now();
  });

  // 新增计算属性：缓存与最新日志的差距
  const gapToLatestLog = computed(() => {
    return Math.max(0, absoluteTotalCount.value - totalCount.value);
  });

  /**
   * 【核心】方向性缓存清除：根据锚定方向，删除另一端的日志。
   * @param anchorDirection 'newest' (保留最新，删除最早) 或 'oldest' (保留最早，删除最新)
   */
  const purgeCache = (anchorDirection: "newest" | "oldest") => {
    if (logsMap.value.size <= TERMINAL_SIZE) {
      return;
    }

    const logsArray = sortedLogs.value;
    const excess = logsMap.value.size - TERMINAL_SIZE;

    if (excess <= 0) return;

    if (anchorDirection === "oldest") {
      // Requirement 1: 锚定旧数据 -> 删除最新的日志
      // logsArray.slice(logsMap.value.size - excess) 得到要删除的最新那部分日志
      const keysToDelete = logsArray
        .slice(logsMap.value.size - excess)
        .map((log) => log.id);
      keysToDelete.forEach((key) => logsMap.value.delete(key));
      console.warn(`[Purge] 锚定旧数据：已删除 ${excess} 条最新日志。`);
    } else if (anchorDirection === "newest") {
      // Requirement 2: 锚定新数据 -> 删除最早的日志
      // logsArray.slice(0, excess) 得到要删除的最早那部分日志
      const keysToDelete = logsArray.slice(0, excess).map((log) => log.id);
      keysToDelete.forEach((key) => logsMap.value.delete(key));
      console.warn(`[Purge] 锚定新数据：已删除 ${excess} 条最旧日志。`);
    }
  };

  /**
   * 调用历史 API 加载更旧的日志 (触发锚定旧数据)
   */
  const fetchOlderLogs = async (): Promise<number> => {
    if (isFetchingHistory.value || !hasMoreHistory.value) {
      return 0;
    }

    isFetchingHistory.value = true;

    const cursorTimestamp = oldestLogTimestamp.value;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const { logs: newOlderLogs, hasMore } = mockFetchOlderLogs(cursorTimestamp);

    let logsAddedCount = 0;

    // 1. 合并新旧数据
    for (const log of newOlderLogs) {
      if (!logsMap.value.has(log.id)) {
        logsMap.value.set(log.id, log);
        logsAddedCount++;
      }
    }

    // 2. 触发：锚定旧数据（保留旧日志，删除最新的日志）
    purgeCache("oldest");

    // 3. 更新状态
    isFetchingHistory.value = false;
    hasMoreHistory.value = hasMore;

    return logsAddedCount;
  };

  /**
   * 轮询拉取最新日志 (触发锚定新数据)
   */
  const pullAndProcessLogs = async (): Promise<LogItem[]> => {
    const { logs: newLogs, absoluteTotalCount: absoluteCount } =
      mockFetchLogs();
    const addedItems: LogItem[] = [];

    // 1. 更新绝对最新计数
    absoluteTotalCount.value = absoluteCount;

    // 2. 合并新日志 (包含去重)
    for (const log of newLogs) {
      if (!logsMap.value.has(log.id)) {
        logsMap.value.set(log.id, log);
        addedItems.push(log);
      }
    }

    // 3. 触发：锚定新数据（保留最新日志，删除最早的日志）
    purgeCache("newest");

    return addedItems;
  };

  /**
   * 获取指定范围的日志切片
   */
  const getLogSlice = (
    start: number,
    length: number,
    userIdFilter: string | null
  ): LogItem[] => {
    let logs = sortedLogs.value;

    if (userIdFilter) {
      logs = logs.filter((log) => log.userId === userIdFilter);
    }

    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(logs.length, safeStart + length);

    return logs.slice(safeStart, safeEnd);
  };

  /**
   * 清除所有日志，并重置所有时间/数据相关的状态
   */
  const clearAllLogs = () => {
    logsMap.value.clear();
    absoluteTotalCount.value = 0;
    hasMoreHistory.value = true;
    isFetchingHistory.value = false; // 确保加载状态被重置
  };

  /**
   * 模拟导出所有日志
   */
  const exportAllLogs = () => {
    const logText = sortedLogs.value
      .map(
        (log) =>
          `${new Date(log.timestamp).toISOString()} [${log.level}] ${
            log.serviceName
          } (${log.userId}): ${log.message}`
      )
      .join("\n");

    // 模拟下载文件
    const blob = new Blob([logText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs_export_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("日志导出已触发。");
  };

  return {
    logsMap,
    totalCount,
    sortedLogs,
    isFetchingHistory,
    hasMoreHistory,
    absoluteTotalCount,
    gapToLatestLog,
    oldestLogTimestamp,
    pullAndProcessLogs,
    fetchOlderLogs,
    getLogSlice,
    clearAllLogs,
    exportAllLogs,
  };
});
