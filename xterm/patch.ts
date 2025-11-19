// stores/logTerminalStore.ts

import { defineStore } from "pinia";
import { ref, computed, Ref } from "vue";

// --- 配置常量 ---
const MAX_LOG_COUNT = 10000; // 日志存储上限
const POLLING_INTERVAL = 2000; // 轮询间隔 (2秒)
const XTERM_DISPLAY_LIMIT = 2000; // Xterm 最大显示条数限制

// 动画相关常量
const ANIMATION_DURATION_MS = 300; // 动画持续时间
const MOVE_STEP_SMOOTH = 2000; // 动画目标步长 (切换到下一个/上一个窗口)
const POST_MOVE_LOCK_MS = 50; // 滚动后锁定时间，防止 Xterm 事件循环

// --- 类型定义 ---
export type WindowMoveDirection = "OLDER" | "NEWER" | "LATEST" | null;

export interface LogEntry {
  id: number;
  message: string;
  timestamp: number;
  sequence: number;
  level: "INFO" | "WARN" | "ERROR" | string;
  userId: string;
  clientId: string;
}

// --- 模拟 API 接口 (保持不变) ---
let mockSequenceCounter = 1;

const createMockLog = (timestamp: number, baseId: number): LogEntry => {
  const id = baseId + Math.random() * 100000;
  mockSequenceCounter++;
  const userId = `U${Math.floor(Math.random() * 5) + 1}`;
  const clientId = `C${Math.floor(Math.random() * 3) + 1}`;

  return {
    id: id,
    message: `Log entry at ${new Date(
      timestamp
    ).toLocaleTimeString()} - Seq: ${mockSequenceCounter}`,
    timestamp: timestamp,
    sequence: mockSequenceCounter,
    level: baseId % 15 === 0 ? "ERROR" : baseId % 5 === 0 ? "WARN" : "INFO",
    userId: userId,
    clientId: clientId,
  };
};

const mockFetchLatestLogs = async (
  maxTimestamp: number | null,
  limit: number
): Promise<LogEntry[]> => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const logs: LogEntry[] = [];
  const baseTimestamp = maxTimestamp || Date.now();
  const actualCount = Math.floor(Math.random() * limit) + 2;

  for (let i = 1; i <= actualCount; i++) {
    const currentTimestamp = baseTimestamp + i * 10 + Math.random() * 5;
    logs.push(createMockLog(currentTimestamp, i * 2000));
  }
  return logs;
};

// --- 辅助函数 (保持不变) ---
const primarySort = (a: LogEntry, b: LogEntry): number => {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  return a.sequence - b.sequence;
};

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

const filterLogs = (
  logs: LogEntry[],
  userId: string,
  clientId: string
): LogEntry[] => {
  if (!userId && !clientId) {
    return logs;
  }

  return logs.filter((log) => {
    let match = true;
    if (userId && log.userId !== userId) {
      match = false;
    }
    if (clientId && log.clientId !== clientId) {
      match = false;
    }
    return match;
  });
};

// --- Pinia Store ---

export const useLogTerminalStore = defineStore("logTerminal", () => {
  // --- State ---
  const isPolling = ref(false);
  const isAutoScrolling = ref(true);

  const allLogs: Ref<LogEntry[]> = ref([]);
  const logIdSet: Ref<Set<number>> = ref(new Set());
  const maxLogTimestamp: Ref<number | null> = ref(null);

  const scrollLogIndexStart = ref(0);
  const latestPolledLogs: Ref<LogEntry[]> = ref([]);

  // 筛选状态
  const filterUserId = ref("");
  const filterClientId = ref("");

  // 动画状态
  const isAnimating = ref(false);
  const animationTargetStart = ref(0);
  let animationFrameId: number | null = null;

  // 【新增状态】用于防止滚动事件循环
  const isPostMoveLocked = ref(false);

  // 渲染相关缓存
  const lastWindowMoveDirection: Ref<WindowMoveDirection> = ref(null);
  const previousRenderContent: Ref<LogEntry[]> = ref([]);

  let pollingTimer: number | null = null;

  // --- Getters ---

  // 【优化】计算 trim 后的筛选值，避免重复计算
  const trimmedFilterUserId = computed(() => filterUserId.value.trim());
  const trimmedFilterClientId = computed(() => filterClientId.value.trim());

  const isFilterActive = computed(
    () => !!trimmedFilterUserId.value || !!trimmedFilterClientId.value
  );

  /**
   * 根据筛选条件返回活跃的日志列表 (基于 allLogs)
   */
  const activeLogs = computed<LogEntry[]>(() => {
    return filterLogs(
      allLogs.value,
      trimmedFilterUserId.value,
      trimmedFilterClientId.value
    );
  });

  /**
   * 核心：返回当前已截断的日志列表 (基于 activeLogs)
   */
  const displayContent = computed<LogEntry[]>(() => {
    const baseLogs = activeLogs.value;
    const totalLogs = baseLogs.length;

    let start = scrollLogIndexStart.value;
    start = Math.max(0, start);

    const maxStart = Math.max(0, totalLogs - XTERM_DISPLAY_LIMIT);
    start = Math.min(start, maxStart);

    if (scrollLogIndexStart.value !== start) {
      scrollLogIndexStart.value = start;
    }

    return baseLogs.slice(start, start + XTERM_DISPLAY_LIMIT);
  });

  const isViewingNewest = computed(() => {
    const baseLogsLength = activeLogs.value.length;
    const maxStart = Math.max(0, baseLogsLength - XTERM_DISPLAY_LIMIT);
    return scrollLogIndexStart.value === maxStart;
  });

  const isViewingOldest = computed(() => {
    return scrollLogIndexStart.value === 0;
  });

  // --- Actions ---

  const insertLogs = (newLogs: LogEntry[], isPolled: boolean = false) => {
    const logsToInsert: LogEntry[] = [];

    newLogs.forEach((log) => {
      if (!logIdSet.value.has(log.id)) {
        logIdSet.value.add(log.id);
        logsToInsert.push(log);
      }
    });

    if (logsToInsert.length === 0) return;
    logsToInsert.sort(primarySort);

    const isAtLatestBeforeInsert = isViewingNewest.value;

    logsToInsert.forEach((newLog) => {
      const index = findInsertionIndex(allLogs.value, newLog);
      allLogs.value.splice(index, 0, newLog);

      if (index <= scrollLogIndexStart.value && !isAtLatestBeforeInsert) {
        scrollLogIndexStart.value += 1;
      }
    });

    const currentMaxTime =
      allLogs.value[allLogs.value.length - 1]?.timestamp ?? null;
    maxLogTimestamp.value = currentMaxTime;

    if (allLogs.value.length > MAX_LOG_COUNT) {
      const excess = allLogs.value.length - MAX_LOG_COUNT;
      const removed = allLogs.value.splice(0, excess);
      removed.forEach((log) => logIdSet.value.delete(log.id));

      scrollLogIndexStart.value = Math.max(
        0,
        scrollLogIndexStart.value - excess
      );
    }

    if (isAtLatestBeforeInsert) {
      forceMoveDisplayWindow("LATEST");
    }

    // 【修复】筛选模式下也应处理符合条件的增量日志
    if (isPolled && isAutoScrolling.value) {
      const filteredNewLogs = filterLogs(
        logsToInsert,
        trimmedFilterUserId.value,
        trimmedFilterClientId.value
      );

      if (filteredNewLogs.length > 0) {
        latestPolledLogs.value.push(...filteredNewLogs);
      }
    }
  };

  /**
   * 内部非动画版本的窗口移动
   */
  const forceMoveDisplayWindow = (direction: WindowMoveDirection) => {
    const baseLogsLength = activeLogs.value.length;
    const maxStart = Math.max(0, baseLogsLength - XTERM_DISPLAY_LIMIT);
    let newStart = scrollLogIndexStart.value;

    if (direction === "LATEST") {
      newStart = maxStart;
    }

    if (scrollLogIndexStart.value !== newStart) {
      previousRenderContent.value = displayContent.value;
      lastWindowMoveDirection.value = direction;
      scrollLogIndexStart.value = newStart;
      latestPolledLogs.value = [];
    } else {
      lastWindowMoveDirection.value = null;
    }
  };

  /**
   * 【主要对外暴露的移动函数】开始动画滚动
   */
  const moveDisplayWindow = (direction: WindowMoveDirection) => {
    if (isAnimating.value) {
      cancelAnimationFrame(animationFrameId!);
    }

    if (direction === "LATEST") {
      forceMoveDisplayWindow("LATEST");
      return;
    }

    // 动画切换必须在非筛选模式下进行，否则序列号计算错误
    if (isFilterActive.value) {
      console.warn(
        "Cannot perform smooth scroll animation while filters are active."
      );
      forceMoveDisplayWindow(direction); // 切换到非动画版本
      return;
    }

    const baseLogsLength = activeLogs.value.length;
    const maxStart = Math.max(0, baseLogsLength - XTERM_DISPLAY_LIMIT);

    let targetStart = scrollLogIndexStart.value;

    switch (direction) {
      case "OLDER":
        targetStart = Math.max(0, targetStart - MOVE_STEP_SMOOTH);
        break;
      case "NEWER":
        targetStart = Math.min(maxStart, targetStart + MOVE_STEP_SMOOTH);
        break;
      case null:
        return;
    }

    if (scrollLogIndexStart.value === targetStart) {
      lastWindowMoveDirection.value = null;
      return;
    }

    animationTargetStart.value = targetStart;
    isAnimating.value = true;

    previousRenderContent.value = displayContent.value;
    lastWindowMoveDirection.value = direction;

    animateScroll(targetStart, direction);

    // 【修复】动画完成后，短暂锁定 Xterm 滚动条
    setTimeout(() => {
      isPostMoveLocked.value = true;
      setTimeout(() => {
        isPostMoveLocked.value = false;
      }, POST_MOVE_LOCK_MS);
    }, ANIMATION_DURATION_MS);
  };

  /**
   * 内部动画循环函数 (保持不变)
   */
  const animateScroll = (
    targetStart: number,
    direction: WindowMoveDirection
  ) => {
    const start = scrollLogIndexStart.value;
    const totalDistance = targetStart - start;

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);

      const easedProgress =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const newStartFloat = start + totalDistance * easedProgress;
      const newStart = Math.round(newStartFloat);

      if (scrollLogIndexStart.value !== newStart) {
        previousRenderContent.value = displayContent.value;
        scrollLogIndexStart.value = newStart;
      }

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        scrollLogIndexStart.value = targetStart;
        isAnimating.value = false;
        lastWindowMoveDirection.value = null;
      }
    };

    animationFrameId = requestAnimationFrame(step);
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
    const initialLogs = await mockFetchLatestLogs(null, 1000);
    insertLogs(initialLogs, false);
    forceMoveDisplayWindow("LATEST");

    poll();
    pollingTimer = setInterval(poll, POLLING_INTERVAL);
  };

  const stopPolling = () => {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    isPolling.value = false;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      isAnimating.value = false;
      animationTargetStart.value = 0;
    }
  };

  /**
   * 清除所有日志数据和缓存
   */
  const clearTerminal = () => {
    allLogs.value = [];
    logIdSet.value.clear();
    maxLogTimestamp.value = null;

    latestPolledLogs.value = [];
    scrollLogIndexStart.value = 0;
    previousRenderContent.value = [];
    lastWindowMoveDirection.value = null;

    filterUserId.value = "";
    filterClientId.value = "";
    isPostMoveLocked.value = false;

    stopPolling();
  };

  /**
   * 重置筛选并滚动到最新
   */
  const resetFilters = () => {
    filterUserId.value = "";
    filterClientId.value = "";
    forceMoveDisplayWindow("LATEST");
  };

  return {
    MAX_LOG_COUNT,
    XTERM_DISPLAY_LIMIT,
    allLogsLength: computed(() => allLogs.value.length),
    isPolling,
    isAutoScrolling,
    isAnimating,
    isPostMoveLocked, // 【新增导出】

    scrollLogIndexStart,
    isViewingOldest,
    isViewingNewest,
    latestPolledLogs,

    lastWindowMoveDirection,
    previousRenderContent,

    filterUserId,
    filterClientId,
    isFilterActive,
    activeLogs,
    resetFilters,

    displayContent,

    fetchLatestLogs,
    stopPolling,
    clearTerminal,
    moveDisplayWindow,
  };
});
