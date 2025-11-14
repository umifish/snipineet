import { defineStore } from "pinia";
import { ref, computed, watch, Ref } from "vue";

// --- 配置常量 ---
const MAX_LOG_COUNT = 50000;
const POLLING_INTERVAL = 2000;
const XTERM_DISPLAY_LIMIT = 2000; // Xterm 最大显示条数限制
// 定义每次滚动加载/切换窗口的步长
const DISPLAY_WINDOW_STEP = 1000;

// --- 类型定义 ---
export interface LogEntry {
  id: number;
  message: string;
  timestamp: number;
  sequence: number;
  level: "INFO" | "WARN" | "ERROR" | string;
  groupId: string;
  clientId: string;
  userId: string;
}

// --- 模拟 API 接口 ---
let mockSequenceCounter = 1;

const createMockLog = (timestamp: number, baseId: number): LogEntry => {
  const id = baseId + Math.random() * 100000;
  mockSequenceCounter++;
  return {
    id: id,
    message: `Log entry at ${new Date(timestamp).toLocaleTimeString()}`,
    timestamp: timestamp,
    sequence: mockSequenceCounter,
    level: baseId % 15 === 0 ? "ERROR" : baseId % 5 === 0 ? "WARN" : "INFO",
    groupId: `group-${baseId % 4}`,
    clientId: `client-${baseId % 3}`,
    userId: `user-${baseId % 5}`,
  };
};

const mockFetchLogs = async (
  minTimestamp: number | null,
  limit: number
): Promise<LogEntry[]> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const logs: LogEntry[] = [];
  // 确保加载比 minTimestamp 更旧的数据
  const baseLogTime = minTimestamp || Date.now();
  for (let i = 1; i <= limit; i++) {
    const currentTimestamp = baseLogTime - i * 60000 - Math.random() * 50000;
    logs.push(createMockLog(currentTimestamp, i * 1000));
  }
  return logs;
};

const mockFetchLatestLogs = async (
  maxTimestamp: number | null,
  limit: number = 10
): Promise<LogEntry[]> => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const logs: LogEntry[] = [];
  // 确保加载比 maxTimestamp 更新的数据
  const baseTimestamp = maxTimestamp || Date.now();
  const actualCount = Math.floor(Math.random() * limit) + 2;

  for (let i = 1; i <= actualCount; i++) {
    const currentTimestamp = baseTimestamp + i * 10 + Math.random() * 5;
    logs.push(createMockLog(currentTimestamp, i * 2000));
  }
  return logs;
};

// --- 排序函数（用于 allLogs 始终保持有序） ---
const primarySort = (a: LogEntry, b: LogEntry): number => {
  // 1. 主键：timestamp 升序
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  // 2. 副键：sequence 升序
  return a.sequence - b.sequence;
};

// --- 二分查找插入位置 (保持 allLogs 有序的关键) ---
const findInsertionIndex = (logs: LogEntry[], newLog: LogEntry): number => {
  let low = 0;
  let high = logs.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (primarySort(logs[mid], newLog) < 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

// --- Pinia Store ---

export const useLogTerminalStore = defineStore("logTerminal", () => {
  // --- State ---
  const isPolling = ref(false);
  const isLoadingHistory = ref(false);
  const isAutoScrolling = ref(true);
  // allLogs 始终保持 timestamp, sequence 升序
  const allLogs: Ref<LogEntry[]> = ref([]);
  const logIdSet: Ref<Set<number>> = ref(new Set());
  const hasMoreHistory = ref(true);

  const minLogTimestamp: Ref<number | null> = ref(null);
  const maxLogTimestamp: Ref<number | null> = ref(null);

  // 过滤器状态
  const filterClientId = ref("");
  const filterUserId = ref("");
  const filterStartTime = ref("");
  const filterEndTime = ref("");
  const filterMessageKeyword = ref("");

  // 【新增/修改状态】当前 Xterm 显示窗口在 filteredLogs/allLogs 中的起始索引
  const scrollLogIndexStart = ref(0);

  const latestPolledLogs: Ref<LogEntry[]> = ref([]);

  let pollingTimer: number | null = null;

  // --- Getters ---

  // 只要有任何筛选条件，即为复杂模式
  const isComplexMode = computed(() => {
    return (
      filterClientId.value !== "" ||
      filterUserId.value !== "" ||
      filterStartTime.value !== "" ||
      filterEndTime.value !== "" ||
      filterMessageKeyword.value !== ""
    );
  });

  // 用于 Xterm 显示的条数限制
  const displayLimit = ref(XTERM_DISPLAY_LIMIT);

  /**
   * 执行日志筛选的核心逻辑
   */
  const filterLogs = (logs: LogEntry[]): LogEntry[] => {
    let startTimeMs: number | null = null;
    let endTimeMs: number | null = null;
    try {
      if (filterStartTime.value) {
        startTimeMs = new Date(filterStartTime.value).getTime();
      }
      if (filterEndTime.value) {
        endTimeMs = new Date(filterEndTime.value).getTime();
      }
    } catch (e) {
      /* 忽略错误 */
    }

    const clientFilter = filterClientId.value.toLowerCase();
    const userFilter = filterUserId.value.toLowerCase();
    const keywordFilter = filterMessageKeyword.value.toLowerCase();

    const filteredLogs = logs.filter((log) => {
      const clientMatch =
        !clientFilter || log.clientId.toLowerCase().includes(clientFilter);
      const userMatch =
        !userFilter || log.userId.toLowerCase().includes(userFilter);
      const keywordMatch =
        !keywordFilter || log.message.toLowerCase().includes(keywordFilter);

      const timeMatch =
        (startTimeMs === null || log.timestamp >= startTimeMs) &&
        (endTimeMs === null || log.timestamp <= endTimeMs);

      return clientMatch && userMatch && keywordMatch && timeMatch;
    });

    return filteredLogs;
  };

  /**
   * 核心：返回当前已筛选且截断的日志列表
   */
  const displayContent = computed<LogEntry[]>(() => {
    // 1. 获取基础日志列表（allLogs 或 筛选结果）
    let baseLogs: LogEntry[];

    if (!isComplexMode.value) {
      baseLogs = allLogs.value;
    } else {
      baseLogs = filterLogs(allLogs.value);
    }

    const totalLogs = baseLogs.length;

    // 2. 确定切片的起始索引 (确保索引有效)
    let start = scrollLogIndexStart.value;

    // 限制起始索引不能小于 0
    start = Math.max(0, start);

    // 限制起始索引不能超过总日志数 - 窗口大小 (即不能切片到空气)
    const maxStart = Math.max(0, totalLogs - displayLimit.value);
    start = Math.min(start, maxStart);

    // 【重要】更新 state 中的 scrollLogIndexStart，使其始终合法
    if (scrollLogIndexStart.value !== start) {
      scrollLogIndexStart.value = start;
    }

    // 3. 切片并返回日志（返回的是从 start 开始的 displayLimit 条日志）
    return baseLogs.slice(start, start + displayLimit.value);
  });

  // 返回当前窗口所在的日志总列表
  const currentBaseLogs = computed<LogEntry[]>(() => {
    return isComplexMode.value ? filterLogs(allLogs.value) : allLogs.value;
  });

  // 判断当前窗口是否已经滚动到最旧的日志
  const isViewingOldest = computed(() => {
    return scrollLogIndexStart.value === 0;
  });

  // 判断当前窗口是否已经滚动到最新的日志
  const isViewingNewest = computed(() => {
    const baseLogsLength = currentBaseLogs.value.length;
    const maxStart = Math.max(0, baseLogsLength - displayLimit.value);
    return scrollLogIndexStart.value === maxStart;
  });

  const errorLogStats = computed(() => {
    let errorCount = 0;
    let warnCount = 0;
    allLogs.value.forEach((log) => {
      const level = log.level.toUpperCase();
      if (level === "ERROR") errorCount++;
      else if (level === "WARN") warnCount++;
    });
    return { errorCount, warnCount };
  });

  // --- Actions ---

  /**
   * 【核心 Action】调整 displayContent 的显示窗口（模拟滚动加载）
   * @param direction 'OLDER' 向上滚动（看更旧的日志），'NEWER' 向下滚动（看更新的日志），'LATEST' 滚动到最新
   */
  const moveDisplayWindow = (direction: "OLDER" | "NEWER" | "LATEST") => {
    const baseLogsLength = currentBaseLogs.value.length;
    const maxStart = Math.max(0, baseLogsLength - displayLimit.value);

    let newStart = scrollLogIndexStart.value;

    switch (direction) {
      case "OLDER":
        // 向上滚动：起始索引减小，显示更旧的日志
        newStart = Math.max(0, newStart - DISPLAY_WINDOW_STEP);
        break;
      case "NEWER":
        // 向下滚动：起始索引增大，显示更新的日志
        newStart = Math.min(maxStart, newStart + DISPLAY_WINDOW_STEP);
        break;
      case "LATEST":
        // 滚动到最新：起始索引设置为最大值
        newStart = maxStart;
        break;
    }

    if (scrollLogIndexStart.value !== newStart) {
      scrollLogIndexStart.value = newStart;
      // 当窗口移动时，清空增量日志，强制全量重绘
      latestPolledLogs.value = [];
    }
  };

  /**
   * 核心插入逻辑：使用二分查找插入新日志并保持 allLogs 有序且去重
   */
  const insertLogs = (newLogs: LogEntry[], isPolled: boolean = false) => {
    const logsToInsert: LogEntry[] = [];

    // 1. 筛选出不重复的日志
    newLogs.forEach((log) => {
      if (!logIdSet.value.has(log.id)) {
        logIdSet.value.add(log.id);
        logsToInsert.push(log);
      }
    });

    if (logsToInsert.length === 0) return;

    // 2. 将待插入的日志根据 primarySort 排序
    logsToInsert.sort(primarySort);

    // 3. 采用归并/二分查找插入策略
    let tempLogs = allLogs.value;

    // 【重要】如果当前窗口不是最新的，新数据应该插入到 allLogs，但不应影响 scrollLogIndexStart 的绝对位置
    const isAtLatestBeforeInsert = isViewingNewest.value;

    logsToInsert.forEach((newLog) => {
      // 找到插入位置 (使用二分查找)
      const index = findInsertionIndex(tempLogs, newLog);
      tempLogs.splice(index, 0, newLog);

      // 如果新日志插入的位置在当前窗口之前，需要调整起始索引，防止窗口跳动
      if (index <= scrollLogIndexStart.value && !isAtLatestBeforeInsert) {
        scrollLogIndexStart.value += 1;
      }
    });

    // 4. 更新时间戳边界
    const currentMinTime = tempLogs[0]?.timestamp ?? null;
    const currentMaxTime = tempLogs[tempLogs.length - 1]?.timestamp ?? null;
    minLogTimestamp.value = currentMinTime;
    maxLogTimestamp.value = currentMaxTime;

    // 5. 截断 allLogs 保持 MAX_LOG_COUNT 限制（保留最新的日志）
    if (tempLogs.length > MAX_LOG_COUNT) {
      const excess = tempLogs.length - MAX_LOG_COUNT;
      const removed = tempLogs.splice(0, excess); // 移除最旧的日志
      removed.forEach((log) => logIdSet.value.delete(log.id));

      // 截断后，起始索引也需要相应调整
      scrollLogIndexStart.value = Math.max(
        0,
        scrollLogIndexStart.value - excess
      );
    }

    // 6. 如果插入前在最新窗口，则插入后依然保持在最新窗口
    if (isAtLatestBeforeInsert) {
      moveDisplayWindow("LATEST");
    }

    // 7. 更新增量日志列表 (仅简单模式下需要增量渲染)
    if (isPolled && !isComplexMode.value) {
      latestPolledLogs.value.push(...logsToInsert);
    }
  };

  const fetchLatestLogs = async () => {
    if (isPolling.value) return;

    const poll = async () => {
      try {
        const fetchedLogs = await mockFetchLatestLogs(
          maxLogTimestamp.value,
          50
        );

        if (fetchedLogs.length > 0) {
          latestPolledLogs.value = [];
          insertLogs(fetchedLogs, true);
        }
      } catch (error) {
        console.error("Error polling for latest logs:", error);
      }
    };

    isPolling.value = true;
    poll();

    pollingTimer = setInterval(poll, POLLING_INTERVAL);
  };

  const stopPolling = () => {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    isPolling.value = false;
  };

  const loadOlderLogs = async () => {
    if (isLoadingHistory.value || !hasMoreHistory.value) return;
    isLoadingHistory.value = true;

    const cursorTimestamp = minLogTimestamp.value;
    const currentMinTime = cursorTimestamp || Date.now();

    try {
      const limit = 500;
      const fetchedLogs = await mockFetchLogs(currentMinTime - 1, limit);

      if (fetchedLogs.length === 0) {
        hasMoreHistory.value = false;
        return;
      }

      const prevLength = allLogs.value.length;
      insertLogs(fetchedLogs, false);
      const newLogsCount = allLogs.value.length - prevLength;

      if (newLogsCount < limit) {
        hasMoreHistory.value = false;
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      isLoadingHistory.value = false;
    }
  };

  const clearTerminal = () => {
    allLogs.value = [];
    logIdSet.value.clear();
    hasMoreHistory.value = true;
    minLogTimestamp.value = null;
    maxLogTimestamp.value = null;
    latestPolledLogs.value = [];
    scrollLogIndexStart.value = 0; // 重置滚动起始索引
  };

  // --- Watcher ---
  // 监听所有过滤器变化，当筛选条件变化时，默认滚动到最新的数据
  watch(
    [
      filterClientId,
      filterUserId,
      filterStartTime,
      filterEndTime,
      filterMessageKeyword,
    ],
    () => {
      const _ = displayContent.value;
      if (isComplexMode.value) {
        latestPolledLogs.value = [];
        moveDisplayWindow("LATEST"); // 筛选变化，默认看最新结果
      } else {
        moveDisplayWindow("LATEST"); // 退出复杂模式，默认看最新结果
        latestPolledLogs.value = [];
      }
    }
  );

  return {
    MAX_LOG_COUNT,
    XTERM_DISPLAY_LIMIT,
    allLogsLength: computed(() => allLogs.value.length),
    errorLogStats,
    isPolling,
    isLoadingHistory,
    isAutoScrolling,

    filterClientId,
    filterUserId,
    filterStartTime,
    filterEndTime,
    filterMessageKeyword,

    hasMoreHistory,
    isComplexMode,
    latestPolledLogs,

    // 【滚动窗口相关】
    scrollLogIndexStart,
    isViewingOldest,
    isViewingNewest,
    moveDisplayWindow,

    fetchLatestLogs,
    stopPolling,
    loadOlderLogs,
    clearTerminal,

    displayContent,
    displayLimit,
  };
});
