import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { FilterMode, LogDataPacket } from './type'
import { generateMockLogs, pullNewLogsMockAPI, pullOlderLogsMockAPI } from './mock'

// constants
export const MAX_CACHE_SIZE = 10000; // 最大缓存日志数量

// sentinel
export const SENTINEL_POLL_INTERVAL = 3 // 哨兵轮询间隔：每 N 次主轮询执行一次哨兵轮询
export const SENTINEL_QUERY_LIMIT = 200 // 哨兵每次查询的日志数量限制
export const SENTINEL_TIME_WINDOW = 3600000 // 哨兵检查的时间窗口（毫秒），只检查最近时间窗口内的延迟日志
export const SENTINEL_COOLDOWN_INTERVAL = 6 // 哨兵冷却间隔：完成一轮检查后，等待 N 次主轮询再重新启动
export const SENTINEL_TIME_STEP = 300000 // 哨兵每次查询的时间步长（毫秒），每次往前检查的时间范围

/** 基础轮询间隔（毫秒） */
export const POLL_INTERVAL_BASE = 2000; // 2s

/** 最大重试次数，超过后停止轮询 */
export const MAX_RETRY_COUNT = 5;

/** 最大重试延迟（毫秒） */
export const MAX_RETRY_DELAY = 60000; // 60s

/** 随机抖动比例 */
export const RETRY_JITTER_RATIO = 0.1; // 10%

/** 轮询每次获取的日志数量限制 */
export const POLLING_LIMIT = 100;

/** 历史查询每次获取的日志数量限制 */
export const HISTORY_LIMIT = 100;

/** 历史查询的时间步长（毫秒） */
export const HISTORY_TIME_STEP = 3600000; // 1小时

// insertion & sorting
export type Comparator<T> = (a: T, b: T) => number
export type LogComparator = Comparator<LogDataPacket>

export const logComparator: LogComparator = (a, b) => {
    if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp
  }

  return a.sequence - b.sequence
}

/**
 * 查找元素在有序数组中的插入位置
 * @param item 要查找的元素
 * @param array 有序数组
 * @param comparator 比较函数
 * @returns 插入位置索引
 */
export const findInsertionIndex = <T>(
  item: T,
  array: T[],
  comparator: (a: T, b: T) => number
): number => {
  let high = array.length
  let low = 0

  while (low < high) {
    const mid = Math.floor((low + high) / 2)

    if (comparator(array[mid], item) < 0) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

/**
 * 默认的重复 ID 处理函数
 */
const defaultOnDuplicateId = (id: string | number, timestamp?: number) => {
  console.warn(`[LOG PANEL STORE] 发现重复的日志 ID: ${id}, 时间戳: ${timestamp}, 已跳过`)
}

/**
 * 插入日志的选项
 */
export interface InsertLogsOptions<T> {
  /** 日志比较函数，默认为 logComparator（仅适用于 LogDataPacket 类型） */
  comparator?: Comparator<T>
  /** 发现重复 ID 时的回调函数，默认为 defaultOnDuplicateId */
  onDuplicateId?: (id: string | number, timestamp?: number) => void
}

/**
 * 将新日志有序插入到目标数组中，并维护 ID Set
 * @param targetLogs 目标日志数组（会被修改）
 * @param idSet 日志 ID Set（会被修改）
 * @param newLogs 要插入的新日志数组
 * @param options 选项对象，包含 comparator 和 onDuplicateId
 */
export function insertLogsOrdered<T extends { id: string | number }>(
  targetLogs: T[],
  idSet: Set<string | number>,
  newLogs: T[],
  options?: InsertLogsOptions<T>
): void {
  const { comparator = logComparator, onDuplicateId = defaultOnDuplicateId } = options || {}
  
  // 如果没有提供 comparator，且类型是 LogDataPacket，使用默认的 logComparator
  let actualComparator: Comparator<T>

  if (!comparator) {
    // 检查是否是 LogDataPacket 类型
    if (targetLogs.length > 0 && 'timestamp' in targetLogs[0] && 'sequence' in targetLogs[0]) {
      actualComparator = logComparator as unknown as (a: T, b: T) => number
    } else {
      throw new Error('comparator is required for non-LogDataPacket types')
    }
  } else {
    actualComparator = comparator as (a: T, b: T) => number
  }
  if (newLogs.length === 0) {
    return
  }

  const firstNewLog = newLogs[0]
  const lastNewLog = newLogs[newLogs.length - 1]

  // 查找日志范围插入点
  const startIdx = findInsertionIndex(firstNewLog, targetLogs, actualComparator)
  const endIdx = findInsertionIndex(lastNewLog, targetLogs, actualComparator)

  // 截取合并
  const overlappingOldLogs = targetLogs.slice(startIdx, endIdx)
  const logsToMerge = [...overlappingOldLogs, ...newLogs]

  // 去重
  const seenIds = new Set<string | number>()
  const uniqueMergedLogs: T[] = []

  for (const log of logsToMerge) {
    if (!seenIds.has(log.id)) {
      seenIds.add(log.id)
      uniqueMergedLogs.push(log)
    }
    else {
      onDuplicateId(log.id, (log as any).timestamp)
    }
  }

  // 排序
  uniqueMergedLogs.sort(actualComparator)

  // 重组
  const oldSegmentLength = endIdx - startIdx
  const removedLogs = targetLogs.slice(startIdx, startIdx + oldSegmentLength)

  removedLogs.forEach((log) => idSet.delete(log.id))
  uniqueMergedLogs.forEach((log) => idSet.add(log.id))
  targetLogs.splice(startIdx, oldSegmentLength, ...uniqueMergedLogs)
}

// detect & filter
export interface FilterOptions {
  levelFilter?: string
  userIdFilter?: string
  groupIdFilter?: string
  clientIdFilter?: string
}

export const isNil = (val: unknown) => {
  return val == null
}

export const isUnEmptyString = (val: unknown) => {
  return !isNil(val) && `${val}` !== ''
}

export const hasActiveFilter = (mode: FilterMode, filterOptions?: FilterOptions): boolean => {
  const { levelFilter, groupIdFilter, clientIdFilter, userIdFilter } = filterOptions || {}

  switch (mode) {
    case 'NONE':
      return false
    case 'ALL':
      return isUnEmptyString(levelFilter) || isUnEmptyString(groupIdFilter) || isUnEmptyString(clientIdFilter) || isUnEmptyString(userIdFilter)
    case 'LEVEL':
      return isUnEmptyString(levelFilter)
    case 'GROUP_ID':
      return isUnEmptyString(groupIdFilter)
    case 'CLIENT_ID':
      return isUnEmptyString(clientIdFilter)
    case 'USER_ID':
      return isUnEmptyString(userIdFilter)
    default:
      return false
  }
}

export const isLogVisible = (log: LogDataPacket, mode: FilterMode, filterOptions?: FilterOptions) => {
  const { levelFilter, groupIdFilter, clientIdFilter, userIdFilter } = filterOptions || {}

  if (mode === 'NONE') {
    return true
  }

  let isMatched = true

    if (mode === 'ALL') {
    if (isUnEmptyString(levelFilter) && log.logLevel !== levelFilter) {
      isMatched = false
    }

    if (isUnEmptyString(userIdFilter) && log.userId !== userIdFilter) {
      isMatched = false
    }

    if (isUnEmptyString(groupIdFilter) && log.groupId !== groupIdFilter) {
      isMatched = false
    }

    if (isUnEmptyString(clientIdFilter) && log.clientId !== clientIdFilter) {
      isMatched = false
    }
  }
    else if (mode === 'LEVEL') {
    if (isUnEmptyString(levelFilter) && log.logLevel !== levelFilter) {
      isMatched = false
    }
  }
  else if (mode === 'GROUP_ID') {
    if (isUnEmptyString(groupIdFilter) && log.groupId !== groupIdFilter) {
      isMatched = false
    }
  }
  else if (mode === 'CLIENT_ID') {
    if (isUnEmptyString(clientIdFilter) && log.clientId !== clientIdFilter) {
      isMatched = false
    }
  }

  return isMatched
}

// detect & operations
export const isValidLog = (log: unknown) => {
  if (!log) {
    console.log('[LOG PANEL STORE] ')
    return false
  }

  const data = log as LogDataPacket

  if (!isUnEmptyString(data.id)) {
    console.log('[LOG PANEL STORE] ')
    return false
  }

  if (isNil(data.timestamp)) {
    console.log('[LOG PANEL STORE] ')
    return false
  }

  return true
}

const isLogsOrderedAndUnique = (logs: LogDataPacket[]): boolean => {
  logs = Array.isArray(logs) ? logs : []

  if (logs.length === 0) {
    return true
  }

  const seenIds = new Set<string | number>()

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]

    if (seenIds.has(log.id)) {
      console.error(`[LOG PANEL STORE] 发现重复的日志 ID: ${log.id}，位置: ${i}`)
      return false
    }

    seenIds.add(log.id)

    if (i > 0) {
      const prevLog = logs[i - 1]
      const comparison = logComparator(prevLog, log)

      if (comparison > 0) {
        console.error(`[LOG PANEL STORE] 日志顺序错误: 位置 ${i - 1} 的日志 (ID: ${prevLog.id}, timestamp: ${prevLog.timestamp}) 大于位置 ${i} 的日志 (ID: ${log.id}, timestamp: ${log.timestamp})`)
        return false
      }
    }
  }

  return true
}

const getLatestLogTimeAndSequence = (logs?: LogDataPacket[]) => {
  logs = Array.isArray(logs) ? logs : []

    if (logs.length === 0) {
    return { timestamp: Date.now() - 1, sequence: 0 }
    }

  const log = logs[logs.length - 1]

    return { 
    timestamp: log.timestamp,
    sequence: log.sequence,
  }
}

const getOldestLogTimeAndSequence = (logs?: LogDataPacket[]) => {
  logs = Array.isArray(logs) ? logs : []

  if (logs.length === 0) {
    return { timestamp: Date.now(), sequence: 0 }
  }

  const log = logs[0]
    
    return {
    timestamp: log.timestamp,
    sequence: log.sequence,
  }
}

export const useLogStore = defineStore('logStore', () => {
  const allLogs = ref<LogDataPacket[]>([]) // 全部缓存日志
  const logIdSet = ref<Set<string | number>>(new Set()) // 全部缓存日志 ID
  const lastPolledTimestamp = ref<number>(getLatestLogTimeAndSequence(allLogs.value).timestamp) // 最近的轮询时间戳
  const oldestLogTimestamp = ref<number>(getOldestLogTimeAndSequence(allLogs.value).timestamp) // 最旧的日志时间戳

  const filteredLogs = computed(() => {
    if (filterMode.value === 'NONE') {
      return allLogs.value
    }

    const filterOptions: FilterOptions = {
      levelFilter: levelFilter.value || undefined,
      userIdFilter: userIdFilter.value || undefined,
      groupIdFilter: groupIdFilter.value || undefined,
      clientIdFilter: clientIdFilter.value || undefined,
    }

    if (!hasActiveFilter(filterMode.value, filterOptions)) {
      return allLogs.value
    }

    return allLogs.value.filter((item) => isLogVisible(item, filterMode.value, filterOptions))
  })

  const totalCount = computed(() => allLogs.value.length)
  const filteredCount = computed(() => filteredLogs.value.length)

  // polling

  // sentinel

  // history
  const isFetchingHistory = ref(false)
  const hasMoreHistory = ref(true)

  // 使用通用方法插入日志（使用默认的 logComparator 和 onDuplicateId）
  const insertLogsIntoCache = (newLogs: LogDataPacket[]) => {
    insertLogsOrdered(
      allLogs.value,
      logIdSet.value,
      newLogs
      // 使用默认的 logComparator 和 onDuplicateId
    )
  }

  // aggregation & filter
  const filterMode = ref<FilterMode>('NONE')
  const levelFilter = ref<string | null>(null)
  const userIdFilter = ref<string | null>(null)
  const groupIdFilter = ref<string | null>(null)
  const clientIdFilter = ref<string | null>(null)

  const setFilterMode = (mode: FilterMode) => {
    filterMode.value = mode
  }

  const setLevelFilter = (level: string | null) => {
    levelFilter.value = level
  }

  const setUserIdFilter = (id: string | null) => {
    userIdFilter.value = id
  }

  const setGroupIdFilter = (id: string | null) => {
    groupIdFilter.value = id
  }

  const setClientIdFilter = (id: string | null) => {
    clientIdFilter.value = id
  }





  












  // 轮询
  const isPollingError = ref(false)
  const retryCount = ref(0)
  const isPermanentError = ref(false)

  // 【新增】移动哨兵机制：用于检查 [oldestLogTimestamp, lastPolledTimestamp] 区间内的延迟上报日志
  // - sentinelTimestamp: 哨兵当前位置，从 oldestLogTimestamp 开始，逐步移动到 lastPolledTimestamp
  // - sentinelPollCount: 哨兵轮询计数器，用于控制哨兵轮询的频率
  // - sentinelCooldownCount: 哨兵冷却计数器，用于控制哨兵完成检查后的冷却时间
  const sentinelTimestamp = ref<number | null>(null);
  const sentinelPollCount = ref(0);
  const sentinelCooldownCount = ref(0);




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
    hasMoreHistory.value = true; // 重置历史数据状态
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
     * 加载更旧的历史日志。使用时间范围查询和局部排序。
     * 【重要更新】允许从最新端截断数据，但记录截断位置的时间戳，以便轮询时从截断位置继续。
     * 如果加载历史数据后超出缓存上限，从最新端截断数据，并返回特殊值 -1 表示需要停止轮询和哨兵。
     */
    const fetchOlderLogs = async (): Promise<number> => {
        if (!hasMoreHistory.value || isFetchingHistory.value) return 0;
        
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
      insertLogsIntoCache(uniqueOlderLogs);

      // 4. 溢出处理：如果插入后超过上限，从最新端移除，并记录截断位置的时间戳
      if (allLogs.value.length > MAX_CACHE_SIZE) {
        const logsToRemove = allLogs.value.length - MAX_CACHE_SIZE;

        // 记录被截断位置的时间戳（截断前最新日志的时间戳），用于后续轮询从该位置继续
        // 确保数组不为空且索引有效
        if (allLogs.value.length > 0) {
          const lastLogBeforeTruncate = allLogs.value[allLogs.value.length - 1];
          if (lastLogBeforeTruncate) {
            lastPolledTimestamp.value = lastLogBeforeTruncate.timestamp;
          }
        }

        // 从最新的日志（末尾）开始移除，同时更新 ID Set
        const removedLogs = allLogs.value.slice(MAX_CACHE_SIZE);
        removedLogs.forEach((log) => logIdSet.value.delete(log.id));
        allLogs.value.splice(MAX_CACHE_SIZE, logsToRemove);
        console.warn(
          `加载历史日志后缓存溢出，已移除 ${logsToRemove} 条最新日志。截断位置时间戳: ${lastPolledTimestamp.value}`
        );

        // 停止哨兵：重置哨兵状态
        sentinelTimestamp.value = null;
        sentinelPollCount.value = 0;
        sentinelCooldownCount.value = 0;
        console.log(`缓存溢出，已停止哨兵检查`);

        // 返回 -1 表示超出缓存上限，需要停止轮询（由调用方处理）
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
        }

        // 根据实际加载情况更新 hasMoreHistory
        // 判断逻辑：
        // 1. 如果 API 返回的日志数量少于限制，说明可能已经加载到底了
        // 2. 如果 API 返回的日志数量等于限制，说明可能还有更多历史数据
        // 3. 如果 uniqueOlderLogs.length === 0 但 olderLogs.length >= HISTORY_LIMIT，
        //    说明这次返回的都是重复的，但可能还有更多历史数据（继续尝试）
        if (olderLogs.length < HISTORY_LIMIT) {
          hasMoreHistory.value = false
          console.log(`没有更多历史数据了。API 返回日志数: ${olderLogs.length} < ${HISTORY_LIMIT}，去重后: ${uniqueOlderLogs.length}`)
        } else {
          // API 返回的日志数量等于限制，说明可能还有更多历史数据
          hasMoreHistory.value = true
        }

        isFetchingHistory.value = false;
        return uniqueOlderLogs.length;
    };

    /**
     * 哨兵检查：检查 [oldestLogTimestamp, lastPolledTimestamp] 区间内的延迟上报日志
     * @returns 发现的延迟日志数组
     */
    const runSentinelCheck = async (): Promise<LogDataPacket[]> => {
      const sentinelLogs: LogDataPacket[] = [];

      // 当 lastPolledTimestamp 存在且大于 oldestLogTimestamp 时，说明存在需要检查的区间
      if (
        lastPolledTimestamp.value === null ||
        lastPolledTimestamp.value <= oldestLogTimestamp.value
      ) {
        // 如果不存在需要检查的区间，重置哨兵状态
        if (sentinelTimestamp.value !== null) {
          console.log(`不存在需要检查的区间，重置哨兵状态。`);
          sentinelTimestamp.value = null;
          sentinelPollCount.value = 0;
        }
        return sentinelLogs;
      }

      // 计算哨兵检查的有效时间窗口
      // 哨兵只检查最近 SENTINEL_TIME_WINDOW（1小时）时间内的延迟日志
      const sentinelStartTimestamp = Math.max(
        oldestLogTimestamp.value,
        lastPolledTimestamp.value - SENTINEL_TIME_WINDOW
      );

      // 如果区间超过时间窗口，说明区间太大，只检查最近的时间窗口
      if (
        lastPolledTimestamp.value - oldestLogTimestamp.value >
        SENTINEL_TIME_WINDOW
      ) {
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

      // 如果哨兵处于冷却状态，减少冷却计数，跳过本次轮询
      if (sentinelCooldownCount.value > 0) {
        sentinelCooldownCount.value--;
        if (sentinelCooldownCount.value === 0) {
          console.log(`哨兵冷却时间结束，准备重新启动检查`);
        }
        return sentinelLogs;
      }

      // 每 SENTINEL_POLL_INTERVAL 次主轮询执行一次哨兵轮询
      if (sentinelPollCount.value < SENTINEL_POLL_INTERVAL) {
        return sentinelLogs;
      }

      sentinelPollCount.value = 0;

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

      // 如果 lastPolledTimestamp 已更新，且哨兵位置小于新的 lastPolledTimestamp，更新哨兵位置
      if (sentinelTimestamp.value < lastPolledTimestamp.value) {
        sentinelTimestamp.value = lastPolledTimestamp.value;
        console.log(
          `lastPolledTimestamp 已更新到: ${lastPolledTimestamp.value}，哨兵位置已更新`
        );
      }

      // 如果哨兵位置还未达到时间窗口边界，执行哨兵轮询
      if (sentinelTimestamp.value <= sentinelEndTimestamp) {
        // 哨兵位置已经达到或超过时间窗口边界，检查是否需要重置哨兵状态
        const currentTimeWindow =
          lastPolledTimestamp.value - oldestLogTimestamp.value;

        if (currentTimeWindow > SENTINEL_TIME_WINDOW) {
          // 设置冷却时间，等待 SENTINEL_COOLDOWN_INTERVAL 次主轮询后再重新启动
          sentinelCooldownCount.value = SENTINEL_COOLDOWN_INTERVAL;
          sentinelTimestamp.value = null;
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
          sentinelCooldownCount.value = 0;
        }
        return sentinelLogs;
      }

      // 执行哨兵轮询
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
                uniqueSentinelLogs[uniqueSentinelLogs.length - 1].timestamp
              }]`
            );

                    // 插入到缓存中
                    insertLogsIntoCache(uniqueSentinelLogs);

            // 更新哨兵位置为本次查询的最旧日志时间戳（往前递进）
            const oldestSentinelLog = uniqueSentinelLogs[0];
            sentinelTimestamp.value = oldestSentinelLog.timestamp;

            sentinelLogs.push(...uniqueSentinelLogs);
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

          if (currentTimeWindow > SENTINEL_TIME_WINDOW) {
            // 设置冷却时间，等待 SENTINEL_COOLDOWN_INTERVAL 次主轮询后再重新启动
            sentinelCooldownCount.value = SENTINEL_COOLDOWN_INTERVAL;
            sentinelTimestamp.value = null;
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
            sentinelCooldownCount.value = 0;
          }
        }
      } catch (error) {
        console.warn(`哨兵轮询失败:`, error);
        // 哨兵轮询失败不影响主轮询，继续执行
      }

      return sentinelLogs;
    };

    /**
     * 处理缓存溢出：从最旧端移除日志
     */
    const handleCacheOverflow = () => {
      if (allLogs.value.length <= MAX_CACHE_SIZE) {
        return;
      }

      const logsToRemove = allLogs.value.length - MAX_CACHE_SIZE;
      // 从最旧的日志（开头）开始移除，同时更新 ID Set
      const removedLogs = allLogs.value.slice(0, logsToRemove);
      removedLogs.forEach((log) => logIdSet.value.delete(log.id));
      allLogs.value.splice(0, logsToRemove);

      // 更新历史游标
      if (allLogs.value.length > 0) {
        // 更新 oldestLogTimestamp 为新的最旧日志的时间戳
        oldestLogTimestamp.value = allLogs.value[0].timestamp;

        // 如果哨兵位置小于新的 oldestLogTimestamp，更新哨兵位置
        // 考虑时间窗口限制，哨兵位置应该从有效时间窗口的起始位置开始
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

        // 确保 lastPolledTimestamp 不会小于 oldestLogTimestamp
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
          // 清除 lastPolledTimestamp 时，重置哨兵状态
          sentinelTimestamp.value = null;
          sentinelPollCount.value = 0;
        }
      } else {
        oldestLogTimestamp.value = Date.now(); // 缓存为空则重置
        // 缓存为空时，清除 lastPolledTimestamp
        lastPolledTimestamp.value = null;
      }
    };

    /**
     * 轮询获取新日志并同步到缓存
     * 【重要更新】如果存在 lastPolledTimestamp，从该位置继续轮询，避免重复查询。
     * 每次轮询后更新 lastPolledTimestamp 为本次获取的最新日志时间戳。
     * 溢出时从最旧日志端 (开头) 移除，并更新 oldestLogTimestamp。
     */
  const pollNewLogs = async (): Promise<{
    newLogs: LogDataPacket[];
    nextDelay: number;
  }> => {
    let uniqueNewLogs: LogDataPacket[] = [];
        let nextDelay = POLL_INTERVAL_BASE;
        
        try {
            if (Math.random() < 0.05 && retryCount.value < 3) {
                throw new Error("Simulated API failure.");
            }
            
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100)
      );

      // 获取查询起点：如果存在 lastPolledTimestamp，从该位置继续；否则从缓存最新位置开始
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
            
      // 去重和排序
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

      // 与缓存中的日志去重，使用维护的 logIdSet 而不是每次都创建新的 Set
      uniqueNewLogs = uniqueFetchedLogsInBatch.filter(
        (log) => !logIdSet.value.has(log.id)
      );

            if (uniqueNewLogs.length > 0) {
                // 局部插入和排序：处理新日志与现有缓存末尾的交错
        insertLogsIntoCache(uniqueNewLogs);

        // 更新已轮询到的最新时间戳（使用本次获取的最新日志的时间戳）
        const latestNewLog = uniqueNewLogs[uniqueNewLogs.length - 1];
        const previousPolledTimestamp = lastPolledTimestamp.value;
        lastPolledTimestamp.value = latestNewLog.timestamp;
        console.log(
          `轮询成功，更新已轮询时间戳: ${lastPolledTimestamp.value}`
        );

        // 如果之前存在 lastPolledTimestamp（说明正在追回数据），
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
            // 清除 lastPolledTimestamp 时，重置哨兵状态
            sentinelTimestamp.value = null;
            sentinelPollCount.value = 0;
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

      // 执行哨兵检查
      const sentinelLogs = await runSentinelCheck();
      if (sentinelLogs.length > 0) {
        // 将哨兵发现的日志也加入到返回结果中
        uniqueNewLogs = [...uniqueNewLogs, ...sentinelLogs].sort(logComparator);
      }

      // 处理缓存溢出
      handleCacheOverflow(); 

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
        pollNewLogs,

    // 【导出验证函数】用于验证日志的有序性和唯一性（开发/调试用）
    validateLogsOrderedAndUnique: () =>
      isLogsOrderedAndUnique(allLogs.value),
    };
});
