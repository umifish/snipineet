import { defineStore } from "pinia";
import { ref, computed, watch, Ref } from "vue";
import { Terminal } from "xterm";

// --- 配置常量 ---
const MAX_LOG_COUNT = 50000; // 内存中存储的最大日志条数
const RENDER_DEBOUNCE_TIME = 300; // 重绘防抖时间 (ms)
const POLLING_INTERVAL = 2000; // 轮询间隔 (ms)

// --- 类型定义 ---
export interface LogEntry {
  id: number;
  message: string;
  timestamp: number;
  sequence: number; // 保持 sequence 以处理相同时间戳下的排序
  level: "INFO" | "WARN" | "ERROR" | string;
  groupId: string;
  clientId: string;
  userId: string;
}

export type AggregationMode = "NONE" | "GROUP_ID" | "CLIENT_ID" | "USER_ID";

export interface AggregationGroup {
  key: string;
  count: number;
  logs: LogEntry[];
  field: keyof LogEntry;
}

// --- 模拟 API 接口 (使用时间戳游标) ---

/**
 * 模拟获取历史日志，查询时间戳早于 minTimestamp 的数据 (上拉加载)
 */
const mockFetchLogs = async (
  minTimestamp: number | null,
  limit: number
): Promise<LogEntry[]> => {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const logs: LogEntry[] = [];
  const baseLogTime = minTimestamp || Date.now() - 3600000 * 24;

  for (let i = 1; i <= limit; i++) {
    const currentTimestamp = baseLogTime - i * 60000 - Math.random() * 50000;
    const id = Math.floor(Math.random() * 1000000000) + i * 1000000000; // 确保 ID 随机且足够大

    logs.push({
      id: id,
      message: `[ID: ${id}] History log before ${new Date(
        baseLogTime
      ).toLocaleTimeString()}.`,
      timestamp: currentTimestamp,
      sequence: id % 100,
      level: id % 10 === 0 ? "ERROR" : id % 5 === 0 ? "WARN" : "INFO",
      groupId: `group-${id % 4}`,
      clientId: `client-${id % 3}`,
      userId: `user-${id % 5}`,
    });
  }

  return logs.sort((a, b) => a.timestamp - b.timestamp);
};

let mockSequenceCounter = 1;
/**
 * 模拟获取最新日志，查询时间戳晚于 maxTimestamp 的数据 (轮询)
 */
const mockFetchLatestLogs = async (
  maxTimestamp: number | null,
  limit: number = 10
): Promise<LogEntry[]> => {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const logs: LogEntry[] = [];
  const baseTimestamp = maxTimestamp || Date.now() - 50;

  const actualCount = Math.floor(Math.random() * limit) + 2;

  for (let i = 1; i <= actualCount; i++) {
    const id = Math.floor(Math.random() * 1000000000) + i * 1000000000;
    const currentTimestamp = baseTimestamp + i * 10 + Math.random() * 5;
    mockSequenceCounter++;

    logs.push({
      id: id,
      message: `[Realtime] Polled log entry at ${new Date(
        currentTimestamp
      ).toLocaleTimeString()}`,
      timestamp: currentTimestamp,
      sequence: mockSequenceCounter,
      level: id % 15 === 0 ? "ERROR" : id % 5 === 0 ? "WARN" : "INFO",
      groupId: `group-${id % 4}`,
      clientId: `client-${id % 3}`,
      userId: `user-${id % 5}`,
    });
  }

  // 模拟重叠：随机将最后一条日志的 ID 替换为某一个极小的 ID，
  // 以模拟后端发送重复日志，测试前端去重逻辑。
  if (logs.length > 0 && Math.random() < 0.2) {
    logs[logs.length - 1].id = 10001;
  }

  return logs.sort((a, b) => a.timestamp - b.timestamp);
};

// --- Pinia Store ---

export const useLogTerminalStore = defineStore("logTerminal", () => {
  // --- State ---
  const terminalInstance: Ref<Terminal | null> = ref(null);
  const isPolling = ref(false);
  const isLoadingHistory = ref(false);
  const allLogs: Ref<LogEntry[]> = ref([]);

  // 【去重关键】使用 Set 存储所有已加载日志的 ID
  const logIdSet: Ref<Set<number>> = ref(new Set());

  const hasMoreHistory = ref(true);

  // 时间戳游标
  const minLogTimestamp: Ref<number | null> = ref(null);
  const maxLogTimestamp: Ref<number | null> = ref(null);

  // 筛选器状态
  const filterClientId = ref("");
  const filterUserId = ref("");
  const filterStartTime = ref("");
  const filterEndTime = ref("");

  const currentMode: Ref<AggregationMode> = ref("NONE");
  const viewingGroupKey: Ref<string | null> = ref(null);

  let pollingTimer: number | null = null;

  // --- Debounce 机制 ---
  let debounceTimeout: number | null = null;
  const debouncedReRender = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      reRenderTerminal();
      debounceTimeout = null;
    }, RENDER_DEBOUNCE_TIME);
  };

  // --- Getters ---

  /**
   * 筛选、排序、聚合的核心逻辑
   */
  const displayContent = computed<LogEntry[] | AggregationGroup[]>(() => {
    const logs = [...allLogs.value];

    // 预解析时间筛选器
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
      // 如果时间格式无效，则忽略时间筛选
    }

    // 1. 基础筛选 (包含 clientId, userId, Time)
    const clientFilter = filterClientId.value.toLowerCase();
    const userFilter = filterUserId.value.toLowerCase();

    let filteredLogs = logs.filter((log) => {
      const clientMatch =
        !clientFilter || log.clientId.toLowerCase().includes(clientFilter);
      const userMatch =
        !userFilter || log.userId.toLowerCase().includes(userFilter);

      const timeMatch =
        (startTimeMs === null || log.timestamp >= startTimeMs) &&
        (endTimeMs === null || log.timestamp <= endTimeMs);

      return clientMatch && userMatch && timeMatch;
    });

    // 2. 核心排序逻辑 (Timestamp -> Sequence)
    filteredLogs.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.sequence - b.sequence;
    });

    // 3. 聚合逻辑
    const mode = currentMode.value;

    if (mode === "NONE") {
      if (viewingGroupKey.value) {
        const [field, key] = viewingGroupKey.value.split(":") as [
          keyof LogEntry,
          string
        ];
        return filteredLogs.filter((log) => log[field] === key);
      }
      return filteredLogs;
    } else {
      const field: keyof LogEntry =
        mode === "GROUP_ID"
          ? "groupId"
          : mode === "CLIENT_ID"
          ? "clientId"
          : "userId";

      const groups: Record<string, AggregationGroup> = {};

      for (const log of filteredLogs) {
        const key = log[field] as string;
        if (!groups[key]) {
          groups[key] = { key, count: 0, logs: [], field };
        }
        groups[key].count++;
        groups[key].logs.push(log);
      }

      return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
    }
  });

  /**
   * 错误日志高亮统计
   */
  const errorLogStats = computed(() => {
    let errorCount = 0;
    let warnCount = 0;

    allLogs.value.forEach((log) => {
      const level = log.level.toUpperCase();
      if (level === "ERROR") {
        errorCount++;
      } else if (level === "WARN") {
        warnCount++;
      }
    });

    return { errorCount, warnCount };
  });

  // --- Actions ---

  const setTerminalInstance = (term: Terminal) => {
    terminalInstance.value = term;
  };

  const reRenderTerminal = () => {
    const term = terminalInstance.value;
    if (!term) return;

    term.clear();

    const content = displayContent.value;

    // 渲染逻辑 (聚合/详情/列表)
    if (currentMode.value === "NONE" && !viewingGroupKey.value) {
      (content as LogEntry[]).forEach((log) => {
        writeLogToTerminal(log);
      });
    } else if (currentMode.value !== "NONE") {
      term.write(
        `\r\n\x1b[36m--- Aggregating by ${currentMode.value}. Total Groups: ${
          (content as AggregationGroup[]).length
        } ---\x1b[0m\r\n\r\n`
      );
      (content as AggregationGroup[]).forEach((group, index) => {
        const groupLine = `[${
          index + 1
        }] \x1b[33m${group.field.toUpperCase()}:\x1b[0m ${group.key} (\x1b[32m${
          group.count
        } entries\x1b[0m)`;
        term.write(groupLine + `\r\n`);
      });
    } else if (currentMode.value === "NONE" && viewingGroupKey.value) {
      const [field, key] = viewingGroupKey.value.split(":");
      term.write(
        `\r\n\x1b[36m--- Viewing details for ${field}: ${key}. Total: ${
          (content as LogEntry[]).length
        } entries ---\x1b[0m\r\n\r\n`
      );
      (content as LogEntry[]).forEach((log) => {
        writeLogToTerminal(log);
      });
    }

    term.scrollToBottom(); // 定位到底部
  };

  const setAggregationMode = (mode: AggregationMode) => {
    currentMode.value = mode;
    viewingGroupKey.value = null;
    debouncedReRender();
  };

  const setViewingGroup = (groupKey: string | null) => {
    currentMode.value = "NONE";
    viewingGroupKey.value = groupKey;
    debouncedReRender();
  };

  /**
   * 写入新日志，更新时间戳游标，并进行内存控制和去重
   */
  const appendNewLog = (newLog: LogEntry) => {
    // 【去重处理】如果 ID 已经存在，则直接返回，丢弃该重复日志。
    if (logIdSet.value.has(newLog.id)) return;

    // 更新时间戳游标
    if (
      maxLogTimestamp.value === null ||
      newLog.timestamp > maxLogTimestamp.value
    ) {
      maxLogTimestamp.value = newLog.timestamp;
    }
    if (
      minLogTimestamp.value === null ||
      newLog.timestamp < minLogTimestamp.value
    ) {
      minLogTimestamp.value = newLog.timestamp;
    }

    // 内存控制：移除最旧的日志
    if (allLogs.value.length >= MAX_LOG_COUNT) {
      const removedLog = allLogs.value.shift();
      if (removedLog) {
        logIdSet.value.delete(removedLog.id); // 从 Set 中移除 ID
      }
    }

    allLogs.value.push(newLog);
    logIdSet.value.add(newLog.id); // 在 Set 中添加新 ID

    // 仅在非筛选/非聚合模式下直接写入并定位到底部
    const isFiltered =
      filterClientId.value ||
      filterUserId.value ||
      filterStartTime.value ||
      filterEndTime.value;
    if (currentMode.value === "NONE" && !viewingGroupKey.value && !isFiltered) {
      writeLogToTerminal(newLog);
      terminalInstance.value?.scrollToBottom();
    }
  };

  /**
   * 轮询获取最新日志 (根据 maxLogTimestamp)
   */
  const fetchLatestLogs = async () => {
    if (isPolling.value) return;

    const poll = async () => {
      try {
        const fetchedLogs = await mockFetchLatestLogs(
          maxLogTimestamp.value,
          50
        );

        if (fetchedLogs.length > 0) {
          fetchedLogs.sort((a, b) => a.timestamp - b.timestamp);
          fetchedLogs.forEach(appendNewLog);

          if (
            currentMode.value !== "NONE" ||
            filterClientId.value ||
            filterUserId.value ||
            filterStartTime.value ||
            filterEndTime.value
          ) {
            debouncedReRender();
          }
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

  /**
   * 上拉加载历史数据 (根据 minLogTimestamp)
   */
  const loadOlderLogs = async () => {
    if (isLoadingHistory.value || !hasMoreHistory.value) return;
    isLoadingHistory.value = true;

    const cursorTimestamp = minLogTimestamp.value;
    if (cursorTimestamp === null) {
      isLoadingHistory.value = false;
      return;
    }

    try {
      const limit = 500;
      const fetchedLogs = await mockFetchLogs(cursorTimestamp, limit);

      if (fetchedLogs.length === 0) {
        hasMoreHistory.value = false;
        terminalInstance.value?.write(
          "\r\n\x1b[33m--- No more history ---\x1b[0m\r\n"
        );
        return;
      }

      const newLogs: LogEntry[] = [];
      // 【去重处理】遍历新获取的历史日志，排除已存在的 ID
      fetchedLogs.forEach((log) => {
        if (!logIdSet.value.has(log.id)) {
          newLogs.push(log);
        }
      });

      if (newLogs.length === 0) {
        isLoadingHistory.value = false;
        return;
      }

      // 更新最小时间戳游标
      minLogTimestamp.value = newLogs[0].timestamp;

      allLogs.value.unshift(...newLogs);
      newLogs.forEach((log) => logIdSet.value.add(log.id)); // 批量添加新 ID 到 Set

      debouncedReRender();
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      isLoadingHistory.value = false;
    }
  };

  /**
   * 格式化并写入日志到 Xterm 终端 (颜色高亮)
   */
  const writeLogToTerminal = (logData: LogEntry) => {
    const term = terminalInstance.value;
    if (!term) return;

    const level = logData.level.toUpperCase();
    // 日志级别颜色高亮
    const levelColor =
      level === "ERROR"
        ? "\x1b[31m"
        : level === "WARN"
        ? "\x1b[33m"
        : "\x1b[32m";
    const resetColor = "\x1b[0m";
    const timestamp = new Date(logData.timestamp).toLocaleTimeString();

    const formattedLine = `${levelColor}[${timestamp}|${logData.sequence}] [${level}] G:${logData.groupId} C:${logData.clientId} U:${logData.userId}: ${logData.message}${resetColor}\r\n`;

    term.write(formattedLine);
  };

  /**
   * 清除 Xterm 显示功能和 Store 内存 (重置 Set)
   */
  const clearTerminal = () => {
    allLogs.value = [];
    logIdSet.value.clear(); // 清空 ID Set
    hasMoreHistory.value = true;
    minLogTimestamp.value = null;
    maxLogTimestamp.value = null;
    if (terminalInstance.value) {
      terminalInstance.value.clear();
      terminalInstance.value.write("\x1b[34m--- Logs Cleared ---\x1b[0m\r\n");
    }
  };

  // --- Watcher ---
  watch(
    [
      filterClientId,
      filterUserId,
      filterStartTime,
      filterEndTime,
      currentMode,
      viewingGroupKey,
    ],
    () => {
      debouncedReRender();
    }
  );

  return {
    MAX_LOG_COUNT,
    allLogsLength: computed(() => allLogs.value.length),
    errorLogStats,
    isPolling,

    terminalInstance,
    isLoadingHistory,
    filterClientId,
    filterUserId,
    filterStartTime,
    filterEndTime,
    currentMode,
    viewingGroupKey,

    setTerminalInstance,
    reRenderTerminal: debouncedReRender,
    fetchLatestLogs,
    stopPolling,
    loadOlderLogs,
    clearTerminal,
    appendNewLog,
    setAggregationMode,
    setViewingGroup,
    displayContent,
  };
});
