import { defineStore } from "pinia";
import { ref, computed, watch, Ref } from "vue";
import { Terminal } from "xterm";

// --- 配置常量 ---
const MAX_LOG_COUNT = 50000; // 内存中存储的最大日志条数
const RENDER_DEBOUNCE_TIME = 300; // 重绘防抖时间 (ms)

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

export type AggregationMode = "NONE" | "GROUP_ID" | "CLIENT_ID" | "USER_ID";

export interface AggregationGroup {
  key: string;
  count: number;
  logs: LogEntry[];
  field: keyof LogEntry;
}

// --- 模拟 API 接口 ---

const mockFetchLogs = async (
  cursorId: number | null,
  limit: number,
  direction: "before" | "after" = "before"
): Promise<LogEntry[]> => {
  // 模拟异步 API 延迟
  await new Promise((resolve) => setTimeout(resolve, 500));

  const logs: LogEntry[] = [];
  // 如果没有游标，从一个较大的数开始模拟历史数据
  const startId = cursorId || 10000;
  const baseTimestamp = Date.now();

  for (let i = 1; i <= limit; i++) {
    const id = startId - i;
    if (id < 1) continue;

    const currentTimestamp = baseTimestamp - id * 1000;

    logs.push({
      id: id,
      message: `[ID: ${id}] History log from server.`,
      timestamp: currentTimestamp,
      sequence: id % 100,
      level: id % 10 === 0 ? "ERROR" : id % 5 === 0 ? "WARN" : "INFO",
      groupId: `group-${id % 4}`,
      clientId: `client-${id % 3}`,
      userId: `user-${id % 5}`,
    });
  }

  // 返回前按排序规则排序
  return logs.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.sequence - b.sequence;
  });
};

// --- Pinia Store ---

export const useLogTerminalStore = defineStore("logTerminal", () => {
  // --- State ---
  const terminalInstance: Ref<Terminal | null> = ref(null);
  const isConnected = ref(false);
  const isLoadingHistory = ref(false);
  const allLogs: Ref<LogEntry[]> = ref([]);
  const logIdSet: Ref<Set<number>> = ref(new Set());
  const oldestLogId: Ref<number | null> = ref(null);
  const hasMoreHistory = ref(true);
  const filterClientId = ref("");
  const filterUserId = ref("");
  const currentMode: Ref<AggregationMode> = ref("NONE");
  const viewingGroupKey: Ref<string | null> = ref(null);
  let nextSequence = 1;

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
   * 筛选和排序后的日志列表 或 聚合后的分组列表
   */
  const displayContent = computed<LogEntry[] | AggregationGroup[]>(() => {
    const logs = [...allLogs.value];

    // 1. 基础筛选
    const clientFilter = filterClientId.value.toLowerCase();
    const userFilter = filterUserId.value.toLowerCase();

    let filteredLogs = logs.filter((log) => {
      const clientMatch =
        !clientFilter || log.clientId.toLowerCase().includes(clientFilter);
      const userMatch =
        !userFilter || log.userId.toLowerCase().includes(userFilter);
      return clientMatch && userMatch;
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
   * 计算内存中所有 ERROR/WARN 日志的数量 (改进: 错误日志高亮)
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

    // 渲染逻辑 (分组/详情/列表)
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
        term.write(groupLine + `\r\n`); // 无交互模式，不提示 "expand"
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

    term.scrollToBottom();
  };

  const setAggregationMode = (mode: AggregationMode) => {
    currentMode.value = mode;
    viewingGroupKey.value = null;
    debouncedReRender();
  };

  const setViewingGroup = (groupKey: string | null) => {
    viewingGroupKey.value = groupKey;
    currentMode.value = "NONE";
    debouncedReRender();
  };

  const appendNewLog = (
    logData: Omit<LogEntry, "id" | "sequence"> & {
      id?: number;
      sequence?: number;
    }
  ) => {
    const newLog: LogEntry = {
      id: logData.id ?? Date.now() + Math.floor(Math.random() * 10000),
      message: logData.message || "No Message",
      timestamp: logData.timestamp || Date.now(),
      sequence: logData.sequence ?? nextSequence++,
      level: logData.level || "INFO",
      groupId: logData.groupId || "N/A",
      clientId: logData.clientId || "N/A",
      userId: logData.userId || "N/A",
    };

    if (logIdSet.value.has(newLog.id)) return;

    // 日志总数限制 (内存)
    if (allLogs.value.length >= MAX_LOG_COUNT) {
      const removedLog = allLogs.value.shift();
      if (removedLog) {
        logIdSet.value.delete(removedLog.id);
      }
    }

    allLogs.value.push(newLog);
    logIdSet.value.add(newLog.id);

    // 只有在非聚合/非筛选模式下才直接写入
    if (
      currentMode.value === "NONE" &&
      !viewingGroupKey.value &&
      !filterClientId.value &&
      !filterUserId.value
    ) {
      writeLogToTerminal(newLog);
    }
  };

  const loadOlderLogs = async () => {
    if (isLoadingHistory.value || !hasMoreHistory.value) return;
    isLoadingHistory.value = true;

    const cursor = oldestLogId.value || allLogs.value[0]?.id || 10000;

    try {
      const limit = 500;
      const fetchedLogs = await mockFetchLogs(cursor, limit, "before");

      if (fetchedLogs.length === 0) {
        hasMoreHistory.value = false;
        terminalInstance.value?.write(
          "\r\n\x1b[33m--- No more history ---\x1b[0m\r\n"
        );
        return;
      }

      const newLogs: LogEntry[] = [];
      fetchedLogs.forEach((log) => {
        if (!logIdSet.value.has(log.id)) {
          newLogs.push(log);
        }
      });

      if (newLogs.length === 0) {
        isLoadingHistory.value = false;
        return;
      }

      allLogs.value.unshift(...newLogs);
      newLogs.forEach((log) => logIdSet.value.add(log.id));

      oldestLogId.value = newLogs[0].id;

      debouncedReRender();
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      isLoadingHistory.value = false;
    }
  };

  const writeLogToTerminal = (logData: LogEntry) => {
    const term = terminalInstance.value;
    if (!term) return;

    const level = logData.level.toUpperCase();
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

  const clearTerminal = () => {
    allLogs.value = [];
    logIdSet.value.clear();
    oldestLogId.value = null;
    hasMoreHistory.value = true;
    nextSequence = 1;
    if (terminalInstance.value) {
      terminalInstance.value.clear();
      terminalInstance.value.write("\x1b[34m--- Logs Cleared ---\x1b[0m\r\n");
    }
  };

  const connect = (url: string) => {
    console.log(`Connecting to WebSocket: ${url}`);
    isConnected.value = true;
    // 模拟实时消息
    setInterval(() => {
      appendNewLog({
        message: `Realtime log at ${new Date().toLocaleTimeString()}`,
        timestamp: Date.now(),
        groupId: `group-${Math.floor(Math.random() * 4)}`,
        clientId: `client-${Math.floor(Math.random() * 3)}`,
        userId: `user-${Math.floor(Math.random() * 5)}`,
      });
    }, 500);
  };

  // --- Watcher ---
  watch([filterClientId, filterUserId, currentMode, viewingGroupKey], () => {
    debouncedReRender();
  });

  return {
    MAX_LOG_COUNT,
    allLogsLength: computed(() => allLogs.value.length),
    errorLogStats,

    terminalInstance,
    isConnected,
    isLoadingHistory,
    filterClientId,
    filterUserId,
    currentMode,
    viewingGroupKey,

    setTerminalInstance,
    reRenderTerminal: debouncedReRender,
    connect,
    loadOlderLogs,
    clearTerminal,
    appendNewLog,
    setAggregationMode,
    setViewingGroup,
    displayContent, // 导出 displayContent 供外部组件展示聚合结果
  };
});
