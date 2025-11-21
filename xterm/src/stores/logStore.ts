import { defineStore } from "pinia";
import { ref, computed, type Ref } from "vue";

// === 1. 类型和常量定义 ===

export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";
export type FilterMode =
  | "ALL"
  | "NONE"
  | "LEVEL"
  | "GROUP_ID"
  | "CLIENT_ID"
  | "USER_ID";

export interface LogItem {
  id: number;
  timestamp: number; // Unix timestamp in ms
  sequence: number; // 用于时间戳相同时的排序
  level: LogLevel;
  serviceName: string;
  userId: string | null;
  groupId: string;
  clientId: string;
  message: string;
  formattedMsg: string; // 包含 ANSI 颜色的格式化消息
}

export const MAX_CACHE_SIZE = 10000;
export const POLL_INTERVAL_BASE = 2000; // 基础轮询间隔 2s
export const MAX_RETRY_COUNT = 5; // 最大重试次数，超过后停止轮询
const MAX_RETRY_DELAY = 60000; // 最大重试延迟 60s
const RETRY_JITTER_RATIO = 0.1; // 随机抖动比例 10%
const SENTINEL_POLL_INTERVAL = 3; // 哨兵轮询间隔：每 3 次主轮询执行一次哨兵轮询
const SENTINEL_QUERY_LIMIT = 200; // 哨兵每次查询的日志数量限制
const SENTINEL_TIME_WINDOW = 3600000; // 哨兵检查的时间窗口：1小时（3600000ms），只检查最近1小时内的延迟日志
const SENTINEL_COOLDOWN_INTERVAL = 6; // 哨兵冷却间隔：完成一轮检查后，等待 6 次主轮询（约 12 秒）再重新启动
const SENTINEL_TIME_STEP = 300000; // 哨兵每次查询的时间步长：5分钟（300000ms），每次往前检查5分钟

// 【核心常量】历史和轮询相关的常量
const POLLING_LIMIT = 100; // 轮询限制
const HISTORY_LIMIT = 100; // 历史查询限制
const HISTORY_TIME_STEP = 3600000; // 历史查询的时间步长 (1小时 = 3600000 ms)
const MAX_MOCK_HISTORY_SIZE = 50000; // 模拟的总历史日志条数

// 模拟的用户和 ID
const MOCK_USERS = ["admin", "userA", "userB", null];
const MOCK_SERVICES = ["AuthService", "DataProcessor", "Gateway", "Analytics"];
const MOCK_GROUPS = ["A100", "B200", "C300"];
const MOCK_CLIENTS = ["ClientX", "ClientY", "ClientZ"];

// === 2. 通用过滤、比较和查找逻辑抽象 ===

/**
 * LogItem 比较函数：首先按时间戳升序，时间戳相同时按 sequence 升序。
 * 用于保持 allLogs 的严格有序。
 */
export const logComparator = (a: LogItem, b: LogItem): number => {
  // 1. 按时间戳升序
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  // 2. 时间戳相同时，按 sequence 升序
  return a.sequence - b.sequence;
};

/**
 * 通过二分查找，找到在有序数组 logs 中，第一个 logItem 满足 logItem >= targetLog 的索引。
 */
export const findInsertionIndex = (
  logs: LogItem[],
  targetLog: LogItem,
  comparator: (a: LogItem, b: LogItem) => number
): number => {
  let low = 0;
  let high = logs.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    // 如果 logs[mid] < targetLog，则目标在 mid 之后
    if (comparator(logs[mid], targetLog) < 0) {
      low = mid + 1;
    } else {
      // 否则目标可能是 mid 或 mid 之前
      high = mid;
    }
  }
  return low;
};

/**
 * 根据当前的过滤模式和参数，判断单个 LogItem 是否应该被显示。
 */
export const shouldLogBeDisplayed = (
  item: LogItem,
  mode: FilterMode,
  levelFilter: string | null,
  groupIdFilter: string | null,
  clientIdFilter: string | null,
  userIdFilter: string | null
): boolean => {
  if (mode === "NONE") return true;

  let match = true;

  // ALL 模式：必须同时满足所有启用的过滤器（忽略未设置的过滤器）
  if (mode === "ALL") {
    // 【修复】只有当过滤器被设置时才进行匹配检查
    if (userIdFilter !== null && item.userId !== userIdFilter) match = false;
    if (levelFilter !== null && item.level !== levelFilter) match = false;
    if (
      groupIdFilter !== null &&
      groupIdFilter.length > 0 &&
      !item.groupId.includes(groupIdFilter)
    )
      match = false;
    if (
      clientIdFilter !== null &&
      clientIdFilter.length > 0 &&
      !item.clientId.includes(clientIdFilter)
    )
      match = false;
  }
  // 单一模式：仅根据当前模式的过滤器判断（如果过滤器未设置，则显示所有日志）
  else if (mode === "LEVEL") {
    // 【修复】如果 levelFilter 为 null，应该显示所有日志（match 保持为 true）
    if (levelFilter !== null && item.level !== levelFilter) match = false;
  } else if (mode === "GROUP_ID") {
    // 【修复】如果 groupIdFilter 为 null 或空，应该显示所有日志
    if (
      groupIdFilter !== null &&
      groupIdFilter.length > 0 &&
      !item.groupId.includes(groupIdFilter)
    )
      match = false;
  } else if (mode === "CLIENT_ID") {
    // 【修复】如果 clientIdFilter 为 null 或空，应该显示所有日志
    if (
      clientIdFilter !== null &&
      clientIdFilter.length > 0 &&
      !item.clientId.includes(clientIdFilter)
    )
      match = false;
  } else if (mode === "USER_ID") {
    // 【修复】如果 userIdFilter 为 null，应该显示所有日志
    if (userIdFilter !== null && item.userId !== userIdFilter) match = false;
  }

  return match;
};

// === 3. 核心日志插入和历史游标逻辑 ===

/**
 * 高效地将新日志插入到缓存中，采用局部排序和切片替换机制。
 * 【修复】确保合并后的日志有序且唯一（基于 ID 去重）。
 * 【性能优化】同时更新 ID Set，避免每次去重时都遍历整个数组。
 * @param cache 缓存日志数组 (ref)
 * @param idSet ID Set (ref)，用于快速去重检查
 * @param newLogs 经过去重且已排序的新日志数组
 */
const insertLogsOrdered = (
  cache: Ref<LogItem[]>,
  idSet: Ref<Set<number>>,
  newLogs: LogItem[]
): void => {
  if (newLogs.length === 0) return;

  const cacheArray = cache.value;
  const firstNewLog = newLogs[0];
  const lastNewLog = newLogs[newLogs.length - 1];

  // 1. 找到起始插入点 startIdx: cacheArray 中第一个 >= firstNewLog 的日志的索引
  const startIdx = findInsertionIndex(cacheArray, firstNewLog, logComparator);

  // 2. 找到结束插入点 endIdx: cacheArray 中第一个 > lastNewLog 的日志的索引
  let endIdx = findInsertionIndex(cacheArray, lastNewLog, logComparator);

  //    需要向后延伸 endIdx，确保包含所有交错的旧日志
  while (
    endIdx < cacheArray.length &&
    logComparator(cacheArray[endIdx], lastNewLog) <= 0
  ) {
    endIdx++;
  }

  // 3. 截取、合并、去重、排序重组
  const overlappingOldLogs = cacheArray.slice(startIdx, endIdx);
  const mergedLogs = [...overlappingOldLogs, ...newLogs];

  // 【修复】去重：基于 ID 去重，保留第一个出现的日志（按排序顺序）
  const seenIds = new Set<number>();
  const uniqueMergedLogs: LogItem[] = [];
  for (const log of mergedLogs) {
    if (!seenIds.has(log.id)) {
      seenIds.add(log.id);
      uniqueMergedLogs.push(log);
    } else {
      // 发现重复 ID，记录警告（分布式场景下可能发生）
      console.warn(
        `发现重复的日志 ID: ${log.id}, 时间戳: ${log.timestamp}, 已跳过`
      );
    }
  }

  // 对去重后的日志进行排序
  uniqueMergedLogs.sort(logComparator);

  // 4. 使用 splice 替换缓存中的旧片段
  const oldSegmentLength = endIdx - startIdx;
  const removedLogs = cacheArray.slice(startIdx, startIdx + oldSegmentLength);

  // 【性能优化】更新 ID Set：移除被替换的日志 ID，添加新插入的日志 ID
  removedLogs.forEach((log) => idSet.value.delete(log.id));
  uniqueMergedLogs.forEach((log) => idSet.value.add(log.id));

  cacheArray.splice(startIdx, oldSegmentLength, ...uniqueMergedLogs);

  // 【可选】验证最终结果（可通过导出函数手动调用完整验证）
  // 注意：这里只做基本检查，完整验证请使用导出的 validateLogsOrderedAndUnique 函数
};

/**
 * 【新增】验证日志数组是否有序且唯一
 * @param logs 日志数组
 * @returns 如果有序且唯一返回 true，否则返回 false
 */
const validateLogsOrderedAndUnique = (logs: LogItem[]): boolean => {
  if (logs.length === 0) return true;

  const seenIds = new Set<number>();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // 检查唯一性
    if (seenIds.has(log.id)) {
      console.error(`发现重复的日志 ID: ${log.id}，位置: ${i}`);
      return false;
    }
    seenIds.add(log.id);

    // 检查有序性
    if (i > 0) {
      const prevLog = logs[i - 1];
      const comparison = logComparator(prevLog, log);
      if (comparison > 0) {
        console.error(
          `日志顺序错误：位置 ${i - 1} 的日志 (ID: ${prevLog.id}, ts: ${
            prevLog.timestamp
          }) 大于位置 ${i} 的日志 (ID: ${log.id}, ts: ${log.timestamp})`
        );
        return false;
      }
    }
  }

  return true;
};

/**
 * 辅助函数：获取最新日志的时间戳和序列号。
 */
const getLatestLogTimeAndSequence = (logs: LogItem[]) => {
  if (logs.length === 0) {
    // 首次轮询或缓存为空，使用当前时间往前推 50s 作为起始时间
    return { timestamp: Date.now() - 50000, sequence: 0 };
  }
  const lastLog = logs[logs.length - 1];
  return {
    timestamp: lastLog.timestamp,
    sequence: lastLog.sequence,
  };
};

/**
 * 辅助函数：获取最旧日志的时间戳和序列号作为历史查询的上限。
 */
const getOldestLogTimeAndSequence = (logs: LogItem[]) => {
  if (logs.length === 0) {
    // 缓存为空，使用当前时间作为最旧时间戳
    return { timestamp: Date.now(), sequence: 0 };
  }
  const firstLog = logs[0];
  return {
    timestamp: firstLog.timestamp,
    sequence: firstLog.sequence,
  };
};

// === 4. 模拟工具函数 (用于生成数据和 API 模拟) ===

let mockLogIdCounter = MAX_MOCK_HISTORY_SIZE;

const getLogColor = (level: LogLevel) => {
  switch (level) {
    case "ERROR":
      return "\x1b[31m";
    case "WARN":
      return "\x1b[33m";
    case "INFO":
      return "\x1b[32m";
    case "DEBUG":
      return "\x1b[90m";
    default:
      return "\x1b[0m";
  }
};

const formatLog = (item: Omit<LogItem, "formattedMsg">): string => {
  const reset = "\x1b[0m";
  const dim = "\x1b[90m";
  const color = getLogColor(item.level);

  // 格式化：时间戳 (ISO) + Sequence (4位)
  return [
    `${dim}${new Date(item.timestamp).toISOString()}${reset}`,
    `${dim}${item.sequence.toString().padStart(4, "0")}${reset}`,
    `\x1b[36m${item.serviceName.padEnd(12)}${reset}`,
    `\x1b[34m${(item.userId || "N/A").padEnd(8)}${reset}`,
    `\x1b[35m${(item.groupId + "/" + item.clientId).padEnd(14)}${reset}`,
    `${color}${item.level.padEnd(5)}${reset}`,
    `${item.message}`,
  ].join("  ");
};

const mockLogGeneration = (
  id: number,
  timestamp: number,
  isHistorical: boolean
): LogItem => {
  const level: LogLevel = ["INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR"][
    Math.floor(Math.random() * 6)
  ] as LogLevel;
  const serviceName =
    MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)];
  const userId = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
  const groupId = MOCK_GROUPS[Math.floor(Math.random() * MOCK_GROUPS.length)];
  const clientId =
    MOCK_CLIENTS[Math.floor(Math.random() * MOCK_CLIENTS.length)];
  const message = isHistorical
    ? `[History #${id}] Log message for ${serviceName} at level ${level}.`
    : `[LIVE #${id}] Processing request for ${userId || "guest"}.`;

  // 生成 Sequence (0-999)
  const sequence = Math.floor(Math.random() * 1000);

  const baseItem: Omit<LogItem, "formattedMsg"> = {
    id,
    timestamp,
    sequence,
    level,
    serviceName,
    userId,
    groupId,
    clientId,
    message,
  };

  return {
    ...baseItem,
    formattedMsg: formatLog(baseItem),
  };
};

// 用于初始化的模拟函数
const generateMockLogs = (
  count: number,
  startId: number,
  startTime: number
): LogItem[] => {
  const logs: LogItem[] = [];
  let currentTimestamp = startTime;
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    currentTimestamp += 100; // 时间递增
    logs.push(mockLogGeneration(id, currentTimestamp, false));
  }
  return logs;
};

/**
 * 模拟一个基于时间戳的 API 轮询 (拉取新日志)。
 * 新日志模拟存在时间戳交错。
 */
const pullNewLogsMockAPI = (
  sinceTimestamp: number,
  limit: number
): LogItem[] => {
  const newLogs: LogItem[] = [];
  const logCount = Math.min(
    limit,
    10 + Math.floor(Math.random() * (limit - 10))
  );

  let currentTimestamp = sinceTimestamp;

  for (let i = 0; i < logCount; i++) {
    currentTimestamp += 50 + Math.floor(Math.random() * 50);
    mockLogIdCounter++;

    const logItem = mockLogGeneration(
      mockLogIdCounter,
      currentTimestamp,
      false
    );

    // 模拟时间戳重复/交错的场景，使其与缓存末尾日志交错
    if (i > 0 && Math.random() < 0.1) {
      logItem.timestamp = newLogs[i - 1].timestamp;
    }

    newLogs.push(logItem);
  }

  newLogs.sort(logComparator);

  return newLogs;
};

/**
 * 模拟一个基于时间范围的 API 查询，用于历史数据加载 (拉取旧日志)。
 * 查询范围为 (startTime, endTime]。
 */
const pullOlderLogsMockAPI = (
  startTime: number,
  endTime: number,
  limit: number
): LogItem[] => {
  const olderLogs: LogItem[] = [];

  const logCount = Math.min(
    limit,
    10 + Math.floor(Math.random() * (limit - 10))
  );
  const timeRange = endTime - startTime;

  for (let i = 0; i < logCount * 2; i++) {
    // 尝试生成更多日志以满足 limit

    // 在 [startTime, endTime] 范围内随机生成时间戳
    const logTimestamp = startTime + Math.random() * timeRange;

    // 模拟一个旧 ID (ID 从 1 到 MAX_MOCK_HISTORY_SIZE)
    const mockHistoricalId =
      1 + Math.floor(Math.random() * MAX_MOCK_HISTORY_SIZE);

    const logItem = mockLogGeneration(mockHistoricalId, logTimestamp, true);

    // 确保它在时间范围 (startTime, endTime] 内
    if (logItem.timestamp > startTime && logItem.timestamp <= endTime) {
      olderLogs.push(logItem);
    }
  }

  // 历史日志必须按时间升序返回
  olderLogs.sort(logComparator);

  // 模拟 API 仅返回 limit 条（通常是最旧的那些）
  return olderLogs.slice(0, limit);
};

// === 5. Pinia Store 定义 ===

export const useLogStore = defineStore("logTerminal", () => {
  // === 状态 State ===
  const initialLogs = generateMockLogs(
    500,
    MAX_MOCK_HISTORY_SIZE,
    Date.now() - 500 * 100
  ).sort(logComparator);
  const allLogs = ref<LogItem[]>(initialLogs);

  // 【修改】用于跟踪历史加载的最旧时间戳
  const oldestLogTimestamp = ref(
    initialLogs.length > 0 ? initialLogs[0].timestamp : Date.now()
  );

  // 【合并字段】记录轮询的起始/当前位置时间戳
  // - 历史加载截断时：设置为截断位置的时间戳
  // - 每次轮询后：更新为本次获取的最新日志的时间戳
  // - 下次轮询时：从该时间戳继续，避免重复查询
  const lastPolledTimestamp = ref<number | null>(null);

  // 【新增】移动哨兵机制：用于检查 [oldestLogTimestamp, lastPolledTimestamp] 区间内的延迟上报日志
  // - sentinelTimestamp: 哨兵当前位置，从 oldestLogTimestamp 开始，逐步移动到 lastPolledTimestamp
  // - sentinelPollCount: 哨兵轮询计数器，用于控制哨兵轮询的频率
  // - sentinelCooldownCount: 哨兵冷却计数器，用于控制哨兵完成检查后的冷却时间
  const sentinelTimestamp = ref<number | null>(null);
  const sentinelPollCount = ref(0);
  const sentinelCooldownCount = ref(0);

  // 过滤状态
  const filterMode = ref<FilterMode>("ALL");
  const levelFilter = ref<string | null>(null);
  const groupIdFilter = ref<string | null>(null);
  const clientIdFilter = ref<string | null>(null);
  const userIdFilter = ref<string | null>(null);

  // 轮询状态
  const isPollingError = ref(false);
  const retryCount = ref(0);
  const isFetchingHistory = ref(false);
  const isPermanentError = ref(false); // 【新增】永久错误状态（超过最大重试次数）

  // 【性能优化】维护一个 ID Set，避免每次去重时都遍历整个数组
  const logIdSet = ref<Set<number>>(new Set(initialLogs.map((log) => log.id)));

  // === 计算属性 Getters ===

  // 【性能优化】filteredLogs 使用 computed，Vue 会自动缓存，只在依赖变化时重新计算
  const filteredLogs = computed(() => {
    // 如果没有任何过滤条件，直接返回 allLogs（避免不必要的过滤）
    if (filterMode.value === "NONE") {
      return allLogs.value;
    }

    // 【修复】检查是否有任何有效的过滤条件
    let hasActiveFilter = false;

    if (filterMode.value === "ALL") {
      // ALL 模式：检查是否有任何过滤器被设置
      hasActiveFilter =
        levelFilter.value !== null ||
        (groupIdFilter.value !== null && groupIdFilter.value.length > 0) ||
        (clientIdFilter.value !== null && clientIdFilter.value.length > 0) ||
        userIdFilter.value !== null;
    } else if (filterMode.value === "LEVEL") {
      // LEVEL 模式：只检查 levelFilter
      hasActiveFilter = levelFilter.value !== null;
    } else if (filterMode.value === "GROUP_ID") {
      // GROUP_ID 模式：只检查 groupIdFilter
      hasActiveFilter =
        groupIdFilter.value !== null && groupIdFilter.value.length > 0;
    } else if (filterMode.value === "CLIENT_ID") {
      // CLIENT_ID 模式：只检查 clientIdFilter
      hasActiveFilter =
        clientIdFilter.value !== null && clientIdFilter.value.length > 0;
    } else if (filterMode.value === "USER_ID") {
      // USER_ID 模式：只检查 userIdFilter
      hasActiveFilter = userIdFilter.value !== null;
    }

    // 【修复】如果没有有效的过滤条件，直接返回 allLogs（适用于所有模式）
    if (!hasActiveFilter) {
      return allLogs.value;
    }

    // 有过滤条件时才进行过滤
    return allLogs.value.filter((item) =>
      shouldLogBeDisplayed(
        item,
        filterMode.value,
        levelFilter.value,
        groupIdFilter.value,
        clientIdFilter.value,
        userIdFilter.value
      )
    );
  });

  const totalCount = computed(() => allLogs.value.length);
  const filteredCount = computed(() => filteredLogs.value.length);

  // 假设如果最旧时间戳低于 6 个月前，则认为没有更多历史
  const hasMoreHistory = computed(() => {
    const SIX_MONTHS_MS = 6 * 30 * 24 * 3600 * 1000;
    return oldestLogTimestamp.value > Date.now() - SIX_MONTHS_MS;
  });

  // === 动作 Actions ===

  const setFilterMode = (mode: FilterMode) => {
    filterMode.value = mode;
  };
  const setLevelFilter = (level: string | null) => {
    levelFilter.value = level;
  };
  const setGroupIdFilter = (id: string | null) => {
    groupIdFilter.value = id;
  };
  const setClientIdFilter = (id: string | null) => {
    clientIdFilter.value = id;
  };
  const setUserIdFilter = (id: string | null) => {
    userIdFilter.value = id;
  };

  const resetRetryState = () => {
    isPollingError.value = false;
    retryCount.value = 0;
    isPermanentError.value = false; // 【修复】重置永久错误状态
  };

  const clearAllLogs = () => {
    allLogs.value = [];
    logIdSet.value.clear(); // 【性能优化】清空 ID Set
    oldestLogTimestamp.value = Date.now(); // 重置最旧时间戳
    lastPolledTimestamp.value = null; // 清除已轮询时间戳
    // 【新增】重置哨兵状态
    sentinelTimestamp.value = null;
    sentinelPollCount.value = 0;
    sentinelCooldownCount.value = 0; // 重置冷却状态
  };

  /**
   * 清除已轮询时间戳标记（恢复正常轮询，从缓存最新位置开始）
   */
  const clearLastPolledTimestamp = () => {
    lastPolledTimestamp.value = null;
    // 【新增】重置哨兵状态（因为不再需要检查区间）
    sentinelTimestamp.value = null;
    sentinelPollCount.value = 0;
    sentinelCooldownCount.value = 0; // 重置冷却状态
  };

  /**
   * 获取过滤后日志的切片，用于虚拟滚动。
   */
  const getLogSlice = (start: number, size: number): LogItem[] => {
    return filteredLogs.value.slice(start, start + size);
  };

  /**
   * 【已更新】模拟加载更旧的历史日志。使用时间范围查询和局部排序。
   * 【重要更新】允许从最新端截断数据，但记录截断位置的时间戳，以便轮询时从截断位置继续。
   * 【修复】如果加载历史数据后超出缓存上限，返回特殊值 -1 表示需要停止轮询。
   */
  const fetchOlderLogs = async (): Promise<number> => {
    if (!hasMoreHistory.value || isFetchingHistory.value) return 0;

    // 【修复】如果缓存已接近上限，不允许加载历史，避免截断最新数据
    if (allLogs.value.length >= MAX_CACHE_SIZE - 100) {
      console.warn("缓存已满，无法加载更多历史日志。请先导出或清空部分数据。");
      return -1; // 返回 -1 表示需要停止轮询
    }

    isFetchingHistory.value = true;
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 1. 确定查询范围
    const { timestamp: endTime } = getOldestLogTimeAndSequence(allLogs.value);
    const startTime = endTime - HISTORY_TIME_STEP; // 往前推一个时间步长 (1小时)

    // 模拟 API 查询
    const olderLogs = pullOlderLogsMockAPI(startTime, endTime, HISTORY_LIMIT);

    // 2. 去重和排序
    // 【修复】先对 olderLogs 内部去重（分布式场景下，同一批日志可能有重复 ID）
    const seenIdsInBatch = new Set<number>();
    const uniqueOlderLogsInBatch = olderLogs.filter((log) => {
      if (seenIdsInBatch.has(log.id)) {
        console.warn(`历史日志批次中发现重复 ID: ${log.id}，已跳过`);
        return false;
      }
      seenIdsInBatch.add(log.id);
      return true;
    });

    // 对去重后的日志进行排序
    uniqueOlderLogsInBatch.sort(logComparator);

    // 【性能优化】与缓存中的日志去重，使用维护的 logIdSet 而不是每次都创建新的 Set
    const uniqueOlderLogs = uniqueOlderLogsInBatch.filter(
      (log) => !logIdSet.value.has(log.id)
    );

    if (uniqueOlderLogs.length > 0) {
      // 3. 局部插入和排序：处理旧日志与现有缓存开头的交错
      insertLogsOrdered(allLogs, logIdSet, uniqueOlderLogs);

      // 4. 【更新】溢出处理：如果插入后超过上限，从最新端移除，并记录截断位置的时间戳
      if (allLogs.value.length > MAX_CACHE_SIZE) {
        const logsToRemove = allLogs.value.length - MAX_CACHE_SIZE;

        // 【修复】记录被截断位置的时间戳（截断前最新日志的时间戳），用于后续轮询从该位置继续
        // 确保数组不为空且索引有效
        if (allLogs.value.length > 0) {
          const lastLogBeforeTruncate = allLogs.value[allLogs.value.length - 1];
          if (lastLogBeforeTruncate) {
            lastPolledTimestamp.value = lastLogBeforeTruncate.timestamp;

            // 【新增】初始化哨兵状态：当设置 lastPolledTimestamp 时，启动哨兵轮询机制
            // 【重构】哨兵从 lastPolledTimestamp 开始，往更久远的时间递进检查
            if (lastPolledTimestamp.value > oldestLogTimestamp.value) {
              // 哨兵从 lastPolledTimestamp 开始，往更久远的时间递进检查
              sentinelTimestamp.value = lastPolledTimestamp.value;
              sentinelPollCount.value = 0;

              const timeWindow =
                lastPolledTimestamp.value - oldestLogTimestamp.value;
              const sentinelEndTimestamp = Math.max(
                oldestLogTimestamp.value,
                lastPolledTimestamp.value - SENTINEL_TIME_WINDOW
              );
              if (timeWindow > SENTINEL_TIME_WINDOW) {
                console.log(
                  `初始化哨兵状态，区间过大 (${timeWindow}ms > ${SENTINEL_TIME_WINDOW}ms)，哨兵将从 ${lastPolledTimestamp.value} 往更久远的时间递进检查到: ${sentinelEndTimestamp}`
                );
              } else {
                console.log(
                  `初始化哨兵状态，哨兵将从 ${lastPolledTimestamp.value} 往更久远的时间递进检查到: ${oldestLogTimestamp.value}`
                );
              }
            }
          }
        }

        // 【性能优化】从最新的日志（末尾）开始移除，同时更新 ID Set
        const removedLogs = allLogs.value.slice(MAX_CACHE_SIZE);
        removedLogs.forEach((log) => logIdSet.value.delete(log.id));
        allLogs.value.splice(MAX_CACHE_SIZE, logsToRemove);
        console.warn(
          `加载历史日志后缓存溢出，已移除 ${logsToRemove} 条最新日志。截断位置时间戳: ${lastPolledTimestamp.value}`
        );

        // 【修复】返回 -1 表示超出缓存上限，需要停止轮询
        isFetchingHistory.value = false;
        return -1;
      }

      // 5. 更新最旧时间戳
      if (allLogs.value.length > 0) {
        oldestLogTimestamp.value = allLogs.value[0].timestamp;

        // 【修复】确保 lastPolledTimestamp 不会小于 oldestLogTimestamp
        // 如果 lastPolledTimestamp 存在且小于 oldestLogTimestamp，说明逻辑错误
        if (
          lastPolledTimestamp.value !== null &&
          lastPolledTimestamp.value < oldestLogTimestamp.value
        ) {
          console.warn(
            `lastPolledTimestamp (${lastPolledTimestamp.value}) 小于 oldestLogTimestamp (${oldestLogTimestamp.value})，清除 lastPolledTimestamp`
          );
          lastPolledTimestamp.value = null;
        }
      }
    } else if (olderLogs.length < HISTORY_LIMIT) {
      // 如果 API 返回的日志少于限制，并且没有新的 unique 日志，可能已经加载到底了
      // 为避免无限加载，只有当时间戳达到很久以前才停止
      const ONE_MONTH_MS = 30 * 24 * 3600 * 1000;
      if (startTime < Date.now() - ONE_MONTH_MS) {
        // 这里实际上由 computed 的 hasMoreHistory 控制
      }
    }

    isFetchingHistory.value = false;
    return uniqueOlderLogs.length;
  };

  /**
   * 【已更新】模拟轮询获取新日志。使用局部排序。
   * 【重要更新】如果存在 lastPolledTimestamp，从该位置继续轮询，避免重复查询。
   * 每次轮询后更新 lastPolledTimestamp 为本次获取的最新日志时间戳。
   * 溢出时从最旧日志端 (开头) 移除，并更新 oldestLogTimestamp。
   */
  const pullAndProcessLogs = async (): Promise<{
    newLogs: LogItem[];
    nextDelay: number;
  }> => {
    let uniqueNewLogs: LogItem[] = [];
    let nextDelay = POLL_INTERVAL_BASE;

    try {
      if (Math.random() < 0.05 && retryCount.value < 3) {
        throw new Error("Simulated API failure.");
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100)
      );

      // 【简化】获取查询起点：如果存在 lastPolledTimestamp，从该位置继续；否则从缓存最新位置开始
      let sinceTimestamp: number;
      if (lastPolledTimestamp.value !== null) {
        // 从上次轮询的位置继续，避免重复查询
        sinceTimestamp = lastPolledTimestamp.value;
        console.log(`从上次轮询位置继续，时间戳: ${sinceTimestamp}`);
      } else {
        // 正常情况：从缓存最新位置开始
        const latest = getLatestLogTimeAndSequence(allLogs.value);
        sinceTimestamp = latest.timestamp;
      }

      // 模拟 API 调用
      const fetchedLogs = pullNewLogsMockAPI(sinceTimestamp, POLLING_LIMIT);

      // 【修复】去重和排序
      // 先对 fetchedLogs 内部去重（分布式场景下，同一批日志可能有重复 ID）
      const seenIdsInBatch = new Set<number>();
      const uniqueFetchedLogsInBatch = fetchedLogs.filter((log) => {
        if (seenIdsInBatch.has(log.id)) {
          console.warn(`轮询日志批次中发现重复 ID: ${log.id}，已跳过`);
          return false;
        }
        seenIdsInBatch.add(log.id);
        return true;
      });

      // 对去重后的日志进行排序
      uniqueFetchedLogsInBatch.sort(logComparator);

      // 【性能优化】与缓存中的日志去重，使用维护的 logIdSet 而不是每次都创建新的 Set
      uniqueNewLogs = uniqueFetchedLogsInBatch.filter(
        (log) => !logIdSet.value.has(log.id)
      );

      if (uniqueNewLogs.length > 0) {
        // 1. 局部插入和排序：处理新日志与现有缓存末尾的交错
        insertLogsOrdered(allLogs, logIdSet, uniqueNewLogs);

        // 2. 【更新】更新已轮询到的最新时间戳（使用本次获取的最新日志的时间戳）
        // 【修复】确保数组不为空
        if (uniqueNewLogs.length > 0) {
          const latestNewLog = uniqueNewLogs[uniqueNewLogs.length - 1];
          const previousPolledTimestamp = lastPolledTimestamp.value;
          lastPolledTimestamp.value = latestNewLog.timestamp;
          console.log(
            `轮询成功，更新已轮询时间戳: ${lastPolledTimestamp.value}`
          );

          // 3. 【检查】如果之前存在 lastPolledTimestamp（说明正在追回数据），
          // 且本次获取的日志时间戳已经接近当前时间（说明已经追回所有数据），
          // 可以清除 lastPolledTimestamp，恢复正常轮询（从缓存最新位置开始）
          if (previousPolledTimestamp !== null) {
            const now = Date.now();
            const timeDiff = now - lastPolledTimestamp.value;
            // 如果最新日志时间戳已经接近当前时间（差距小于轮询间隔的2倍），说明已经追回
            if (timeDiff < POLL_INTERVAL_BASE * 2) {
              console.log(
                `已追回所有数据，恢复正常轮询。最新日志时间戳: ${lastPolledTimestamp.value}, 当前时间: ${now}`
              );
              lastPolledTimestamp.value = null;
              // 【新增】清除 lastPolledTimestamp 时，重置哨兵状态
              sentinelTimestamp.value = null;
              sentinelPollCount.value = 0;
            }
          }
        }
      } else {
        // 即使没有新日志，也要更新已轮询时间戳（避免重复查询相同的时间范围）
        // 使用 API 返回的最新日志时间戳，如果没有则使用查询起点
        if (fetchedLogs.length > 0) {
          const latestFetchedLog = fetchedLogs[fetchedLogs.length - 1];
          if (latestFetchedLog) {
            lastPolledTimestamp.value = latestFetchedLog.timestamp;
          } else {
            // 如果获取的日志无效，使用查询起点作为已轮询时间戳
            lastPolledTimestamp.value = sinceTimestamp;
          }
        } else {
          // 如果没有返回任何日志，使用查询起点作为已轮询时间戳
          lastPolledTimestamp.value = sinceTimestamp;
        }
      }

      isPollingError.value = false;
      retryCount.value = 0;

      // 【新增】移动哨兵轮询：检查 [oldestLogTimestamp, lastPolledTimestamp] 区间内的延迟上报日志
      // 【优化】限制检查时间窗口，避免区间无限扩大
      // 当 lastPolledTimestamp 存在且大于 oldestLogTimestamp 时，说明存在需要检查的区间
      if (
        lastPolledTimestamp.value !== null &&
        lastPolledTimestamp.value > oldestLogTimestamp.value
      ) {
        // 【优化】计算哨兵检查的有效时间窗口
        // 哨兵只检查最近 SENTINEL_TIME_WINDOW（1小时）时间内的延迟日志，而不是整个区间
        // 时间窗口是相对于 lastPolledTimestamp 的，这意味着：
        // - 如果主轮询每次都能获取到新日志，lastPolledTimestamp 会不断更新
        // - 如果主轮询获取的日志时间跨度很大（比如一次获取了 3 小时的日志），
        //   那么 lastPolledTimestamp 会往前推进 3 小时，时间窗口也会往前推进 3 小时
        // - 哨兵每 3 次主轮询执行一次，会检查相对于当前 lastPolledTimestamp 的最近 1 小时
        // - 这样可以确保哨兵总是检查最新的 1 小时窗口，不会遗漏延迟上报的日志
        const sentinelStartTimestamp = Math.max(
          oldestLogTimestamp.value,
          lastPolledTimestamp.value - SENTINEL_TIME_WINDOW
        );

        // 【优化】如果区间超过时间窗口，说明区间太大，直接重置哨兵状态
        // 这样可以避免检查过大的区间，提高效率
        if (
          lastPolledTimestamp.value - oldestLogTimestamp.value >
          SENTINEL_TIME_WINDOW
        ) {
          // 区间太大，只检查最近的时间窗口
          if (
            sentinelTimestamp.value === null ||
            sentinelTimestamp.value < sentinelStartTimestamp
          ) {
            sentinelTimestamp.value = sentinelStartTimestamp;
            console.log(
              `区间过大 (${
                lastPolledTimestamp.value - oldestLogTimestamp.value
              }ms > ${SENTINEL_TIME_WINDOW}ms)，哨兵只检查最近时间窗口: [${sentinelStartTimestamp}, ${
                lastPolledTimestamp.value
              }]`
            );
          }
        }

        sentinelPollCount.value++;

        // 【新增】如果哨兵处于冷却状态，减少冷却计数，跳过本次轮询
        if (sentinelCooldownCount.value > 0) {
          sentinelCooldownCount.value--;
          if (sentinelCooldownCount.value === 0) {
            console.log(`哨兵冷却时间结束，准备重新启动检查`);
          }
          // 冷却期间不执行哨兵轮询
        } else {
          // 每 SENTINEL_POLL_INTERVAL 次主轮询执行一次哨兵轮询
          if (sentinelPollCount.value >= SENTINEL_POLL_INTERVAL) {
            sentinelPollCount.value = 0;

            // 【重构】哨兵从 lastPolledTimestamp 开始，往更久远的时间递进检查
            // 计算时间窗口的边界（最旧的时间点）
            const sentinelEndTimestamp = Math.max(
              oldestLogTimestamp.value,
              lastPolledTimestamp.value - SENTINEL_TIME_WINDOW
            );

            // 初始化哨兵位置：从 lastPolledTimestamp 开始
            if (sentinelTimestamp.value === null) {
              sentinelTimestamp.value = lastPolledTimestamp.value;
              console.log(
                `初始化哨兵位置: ${sentinelTimestamp.value}，将从该位置往更久远的时间递进检查到: ${sentinelEndTimestamp}`
              );
            }

            // 【优化】如果 lastPolledTimestamp 已更新，且哨兵位置小于新的 lastPolledTimestamp，更新哨兵位置
            // 这样可以确保哨兵始终从最新的 lastPolledTimestamp 开始检查
            if (sentinelTimestamp.value < lastPolledTimestamp.value) {
              sentinelTimestamp.value = lastPolledTimestamp.value;
              console.log(
                `lastPolledTimestamp 已更新到: ${lastPolledTimestamp.value}，哨兵位置已更新`
              );
            }

            // 如果哨兵位置还未达到时间窗口边界，执行哨兵轮询
            if (sentinelTimestamp.value > sentinelEndTimestamp) {
              try {
                // 查询从 sentinelTimestamp 往前 SENTINEL_TIME_STEP 时间范围内的日志
                const queryStartTime = Math.max(
                  sentinelEndTimestamp,
                  sentinelTimestamp.value - SENTINEL_TIME_STEP
                );
                const queryEndTime = sentinelTimestamp.value;

                // 使用 pullOlderLogsMockAPI 查询更久远的日志
                const sentinelFetchedLogs = pullOlderLogsMockAPI(
                  queryStartTime,
                  queryEndTime,
                  SENTINEL_QUERY_LIMIT
                );

                // 过滤出在查询范围内的日志
                const sentinelLogsInRange = sentinelFetchedLogs.filter(
                  (log) =>
                    log.timestamp > queryStartTime &&
                    log.timestamp <= queryEndTime
                );

                if (sentinelLogsInRange.length > 0) {
                  // 对哨兵日志进行去重和排序
                  const seenIdsInSentinelBatch = new Set<number>();
                  const uniqueSentinelLogsInBatch = sentinelLogsInRange.filter(
                    (log) => {
                      if (seenIdsInSentinelBatch.has(log.id)) {
                        return false;
                      }
                      seenIdsInSentinelBatch.add(log.id);
                      return true;
                    }
                  );
                  uniqueSentinelLogsInBatch.sort(logComparator);

                  // 与缓存中的日志去重
                  const uniqueSentinelLogs = uniqueSentinelLogsInBatch.filter(
                    (log) => !logIdSet.value.has(log.id)
                  );

                  if (uniqueSentinelLogs.length > 0) {
                    console.log(
                      `哨兵轮询发现 ${
                        uniqueSentinelLogs.length
                      } 条延迟上报的日志，时间范围: [${
                        uniqueSentinelLogs[0].timestamp
                      }, ${
                        uniqueSentinelLogs[uniqueSentinelLogs.length - 1]
                          .timestamp
                      }]`
                    );

                    // 插入到缓存中
                    insertLogsOrdered(allLogs, logIdSet, uniqueSentinelLogs);

                    // 更新哨兵位置为本次查询的最旧日志时间戳（往前递进）
                    const oldestSentinelLog = uniqueSentinelLogs[0];
                    sentinelTimestamp.value = oldestSentinelLog.timestamp;

                    // 将哨兵发现的日志也加入到返回结果中
                    uniqueNewLogs = [
                      ...uniqueNewLogs,
                      ...uniqueSentinelLogs,
                    ].sort(logComparator);
                  } else {
                    // 没有新日志，将哨兵位置往前移动一个时间步长
                    sentinelTimestamp.value = queryStartTime;
                  }
                } else {
                  // 没有在查询范围内的日志，将哨兵位置往前移动一个时间步长
                  sentinelTimestamp.value = queryStartTime;
                }

                // 如果哨兵位置已经达到或超过时间窗口边界，检查是否需要重置哨兵状态
                if (sentinelTimestamp.value <= sentinelEndTimestamp) {
                  const currentTimeWindow =
                    lastPolledTimestamp.value - oldestLogTimestamp.value;

                  // 【优化】如果区间仍然很大（超过时间窗口），设置冷却时间，等待一段时间后再重新启动检查
                  // 这样可以避免哨兵过于频繁地检查，特别是在主轮询获取的日志时间跨度很大的情况下
                  if (currentTimeWindow > SENTINEL_TIME_WINDOW) {
                    // 设置冷却时间，等待 SENTINEL_COOLDOWN_INTERVAL 次主轮询后再重新启动
                    sentinelCooldownCount.value = SENTINEL_COOLDOWN_INTERVAL;
                    sentinelTimestamp.value = null; // 暂时清空哨兵位置，等待冷却结束后重新初始化
                    console.log(
                      `哨兵已完成一轮检查（从 ${
                        lastPolledTimestamp.value
                      } 检查到 ${sentinelEndTimestamp}），但区间仍然很大 (${currentTimeWindow}ms > ${SENTINEL_TIME_WINDOW}ms)，设置冷却时间 ${SENTINEL_COOLDOWN_INTERVAL} 次主轮询（约 ${
                        (SENTINEL_COOLDOWN_INTERVAL * POLL_INTERVAL_BASE) / 1000
                      } 秒）`
                    );
                  } else {
                    // 区间已经缩小到时间窗口内，重置哨兵状态
                    console.log(
                      `哨兵已完成区间检查，重置哨兵状态。oldestLogTimestamp: ${oldestLogTimestamp.value}, lastPolledTimestamp: ${lastPolledTimestamp.value}`
                    );
                    sentinelTimestamp.value = null;
                    sentinelPollCount.value = 0;
                    sentinelCooldownCount.value = 0; // 清除冷却状态
                  }
                }
              } catch (error) {
                console.warn(`哨兵轮询失败:`, error);
                // 哨兵轮询失败不影响主轮询，继续执行
              }
            } else {
              // 哨兵位置已经达到或超过时间窗口边界，检查是否需要重置哨兵状态
              const currentTimeWindow =
                lastPolledTimestamp.value - oldestLogTimestamp.value;

              // 【优化】如果区间仍然很大（超过时间窗口），设置冷却时间，等待一段时间后再重新启动检查
              if (currentTimeWindow > SENTINEL_TIME_WINDOW) {
                // 设置冷却时间，等待 SENTINEL_COOLDOWN_INTERVAL 次主轮询后再重新启动
                sentinelCooldownCount.value = SENTINEL_COOLDOWN_INTERVAL;
                sentinelTimestamp.value = null; // 暂时清空哨兵位置，等待冷却结束后重新初始化
                console.log(
                  `哨兵已完成一轮检查（从 ${
                    lastPolledTimestamp.value
                  } 检查到 ${sentinelEndTimestamp}），但区间仍然很大 (${currentTimeWindow}ms > ${SENTINEL_TIME_WINDOW}ms)，设置冷却时间 ${SENTINEL_COOLDOWN_INTERVAL} 次主轮询（约 ${
                    (SENTINEL_COOLDOWN_INTERVAL * POLL_INTERVAL_BASE) / 1000
                  } 秒）`
                );
              } else {
                // 区间已经缩小到时间窗口内，重置哨兵状态
                console.log(`哨兵已完成区间检查，重置哨兵状态。`);
                sentinelTimestamp.value = null;
                sentinelPollCount.value = 0;
                sentinelCooldownCount.value = 0; // 清除冷却状态
              }
            }
          }
        }
      } else {
        // 如果不存在需要检查的区间，重置哨兵状态
        if (sentinelTimestamp.value !== null) {
          console.log(`不存在需要检查的区间，重置哨兵状态。`);
          sentinelTimestamp.value = null;
          sentinelPollCount.value = 0;
        }
      }

      // 2. 【溢出处理：从最旧端移除】
      if (allLogs.value.length > MAX_CACHE_SIZE) {
        const logsToRemove = allLogs.value.length - MAX_CACHE_SIZE;
        // 【性能优化】从最旧的日志（开头）开始移除，同时更新 ID Set
        const removedLogs = allLogs.value.slice(0, logsToRemove);
        removedLogs.forEach((log) => logIdSet.value.delete(log.id));
        allLogs.value.splice(0, logsToRemove);

        // 3. 【更新历史游标】
        if (allLogs.value.length > 0) {
          // 更新 oldestLogTimestamp 为新的最旧日志的时间戳
          oldestLogTimestamp.value = allLogs.value[0].timestamp;

          // 【新增】如果哨兵位置小于新的 oldestLogTimestamp，更新哨兵位置
          // 【优化】考虑时间窗口限制，哨兵位置应该从有效时间窗口的起始位置开始
          if (
            sentinelTimestamp.value !== null &&
            lastPolledTimestamp.value !== null
          ) {
            const sentinelStartTimestamp = Math.max(
              oldestLogTimestamp.value,
              lastPolledTimestamp.value - SENTINEL_TIME_WINDOW
            );
            if (sentinelTimestamp.value < sentinelStartTimestamp) {
              console.log(
                `哨兵位置 (${sentinelTimestamp.value}) 小于有效时间窗口起始位置 (${sentinelStartTimestamp})，更新哨兵位置`
              );
              sentinelTimestamp.value = sentinelStartTimestamp;
            }
          } else if (
            sentinelTimestamp.value !== null &&
            sentinelTimestamp.value < oldestLogTimestamp.value
          ) {
            console.log(
              `哨兵位置 (${sentinelTimestamp.value}) 小于新的 oldestLogTimestamp (${oldestLogTimestamp.value})，更新哨兵位置`
            );
            sentinelTimestamp.value = oldestLogTimestamp.value;
          }

          // 【修复】确保 lastPolledTimestamp 不会小于 oldestLogTimestamp
          // 如果 lastPolledTimestamp 存在且小于新的 oldestLogTimestamp，说明它指向的日志已被移除
          // 应该清除它，恢复正常轮询
          if (
            lastPolledTimestamp.value !== null &&
            lastPolledTimestamp.value < oldestLogTimestamp.value
          ) {
            console.warn(
              `lastPolledTimestamp (${lastPolledTimestamp.value}) 小于 oldestLogTimestamp (${oldestLogTimestamp.value})，清除 lastPolledTimestamp`
            );
            lastPolledTimestamp.value = null;
            // 【新增】清除 lastPolledTimestamp 时，重置哨兵状态
            sentinelTimestamp.value = null;
            sentinelPollCount.value = 0;
          }
        } else {
          oldestLogTimestamp.value = Date.now(); // 缓存为空则重置
          // 缓存为空时，清除 lastPolledTimestamp
          lastPolledTimestamp.value = null;
        }
      }
    } catch (error) {
      console.error("Polling failed:", error);
      isPollingError.value = true;
      retryCount.value++;

      // 【修复】如果超过最大重试次数，设置永久错误状态并停止轮询
      if (retryCount.value >= MAX_RETRY_COUNT) {
        isPermanentError.value = true;
        console.error(
          `轮询失败次数超过上限 (${MAX_RETRY_COUNT})，已停止轮询。请手动重试。`
        );
        // 返回空结果，让调用方停止轮询
        return { newLogs: [], nextDelay: 0 };
      }

      // 【完善】指数避退算法：baseDelay * 2^retryCount，带最大延迟上限和随机抖动
      // 1. 计算基础延迟（指数增长）
      const baseDelay = POLL_INTERVAL_BASE * Math.pow(2, retryCount.value - 1);

      // 2. 应用最大延迟上限
      const cappedDelay = Math.min(baseDelay, MAX_RETRY_DELAY);

      // 3. 添加随机抖动（±10%），避免雷群效应（多个客户端同时重试）
      const jitter = cappedDelay * RETRY_JITTER_RATIO * (Math.random() * 2 - 1); // -10% 到 +10%
      nextDelay = Math.max(
        POLL_INTERVAL_BASE,
        Math.round(cappedDelay + jitter)
      );

      console.log(
        `轮询失败，第 ${retryCount.value} 次重试，延迟 ${nextDelay}ms (基础: ${baseDelay}ms, 上限: ${MAX_RETRY_DELAY}ms)`
      );
    }

    return { newLogs: uniqueNewLogs, nextDelay };
  };

  /**
   * 模拟导出所有日志为 JSON 或其他格式。
   */
  const exportAllLogs = () => {
    const json = JSON.stringify(allLogs.value, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    // State
    allLogs,
    filterMode,
    levelFilter,
    groupIdFilter,
    clientIdFilter,
    userIdFilter,
    isPollingError,
    retryCount,
    isFetchingHistory,
    isPermanentError,
    lastPolledTimestamp,

    // Getters
    totalCount,
    filteredCount,
    filteredLogs,
    hasMoreHistory,

    // Actions
    setFilterMode,
    setLevelFilter,
    setGroupIdFilter,
    setClientIdFilter,
    setUserIdFilter,
    resetRetryState,
    clearAllLogs,
    clearLastPolledTimestamp,
    fetchOlderLogs,
    pullAndProcessLogs,
    getLogSlice,
    exportAllLogs,

    // 【导出验证函数】用于验证日志的有序性和唯一性（开发/调试用）
    validateLogsOrderedAndUnique: () =>
      validateLogsOrderedAndUnique(allLogs.value),
  };
});
