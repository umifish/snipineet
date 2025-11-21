import { defineStore } from 'pinia';
import { ref, computed, type Ref } from 'vue'; 

// === 1. 类型和常量定义 ===

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
export type FilterMode = 'ALL' | 'NONE' | 'LEVEL' | 'GROUP_ID' | 'CLIENT_ID' | 'USER_ID';

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

// 【核心常量】历史和轮询相关的常量
const POLLING_LIMIT = 100;           // 轮询限制
const HISTORY_LIMIT = 100;           // 历史查询限制
const HISTORY_TIME_STEP = 3600000;   // 历史查询的时间步长 (1小时 = 3600000 ms)
const MAX_MOCK_HISTORY_SIZE = 50000; // 模拟的总历史日志条数

// 模拟的用户和 ID
const MOCK_USERS = ['admin', 'userA', 'userB', null];
const MOCK_SERVICES = ['AuthService', 'DataProcessor', 'Gateway', 'Analytics'];
const MOCK_GROUPS = ['A100', 'B200', 'C300'];
const MOCK_CLIENTS = ['ClientX', 'ClientY', 'ClientZ'];


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
export const findInsertionIndex = (logs: LogItem[], targetLog: LogItem, comparator: (a: LogItem, b: LogItem) => number): number => {
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
    if (mode === 'NONE') return true;
    
    let match = true; 

    // ALL 模式：必须同时满足所有启用的过滤器
    if (mode === 'ALL') {
        if (userIdFilter && item.userId !== userIdFilter) match = false;
        if (levelFilter && item.level !== levelFilter) match = false;
        if (groupIdFilter && groupIdFilter.length > 0 && !item.groupId.includes(groupIdFilter)) match = false;
        if (clientIdFilter && clientIdFilter.length > 0 && !item.clientId.includes(clientIdFilter)) match = false;
    } 
    // 单一模式：仅根据当前模式的过滤器判断
    else if (mode === 'LEVEL') {
        if (levelFilter && item.level !== levelFilter) match = false;
    } else if (mode === 'GROUP_ID') {
        if (groupIdFilter && groupIdFilter.length > 0 && !item.groupId.includes(groupIdFilter)) match = false;
    } else if (mode === 'CLIENT_ID') {
        if (clientIdFilter && clientIdFilter.length > 0 && !item.clientId.includes(clientIdFilter)) match = false;
    } else if (mode === 'USER_ID') {
        if (userIdFilter && item.userId !== userIdFilter) match = false;
    }

    return match;
};


// === 3. 核心日志插入和历史游标逻辑 ===

/**
 * 高效地将新日志插入到缓存中，采用局部排序和切片替换机制。
 * 【修复】确保合并后的日志有序且唯一（基于 ID 去重）。
 * @param cache 缓存日志数组 (ref)
 * @param newLogs 经过去重且已排序的新日志数组
 */
const insertLogsOrdered = (cache: Ref<LogItem[]>, newLogs: LogItem[]): void => {
    if (newLogs.length === 0) return;

    const cacheArray = cache.value;
    const firstNewLog = newLogs[0];
    const lastNewLog = newLogs[newLogs.length - 1];

    // 1. 找到起始插入点 startIdx: cacheArray 中第一个 >= firstNewLog 的日志的索引
    const startIdx = findInsertionIndex(cacheArray, firstNewLog, logComparator);

    // 2. 找到结束插入点 endIdx: cacheArray 中第一个 > lastNewLog 的日志的索引
    let endIdx = findInsertionIndex(cacheArray, lastNewLog, logComparator);

    //    需要向后延伸 endIdx，确保包含所有交错的旧日志
    while (endIdx < cacheArray.length && logComparator(cacheArray[endIdx], lastNewLog) <= 0) {
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
            console.warn(`发现重复的日志 ID: ${log.id}, 时间戳: ${log.timestamp}, 已跳过`);
        }
    }
    
    // 对去重后的日志进行排序
    uniqueMergedLogs.sort(logComparator);

    // 4. 使用 splice 替换缓存中的旧片段
    const oldSegmentLength = endIdx - startIdx;
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
                console.error(`日志顺序错误：位置 ${i-1} 的日志 (ID: ${prevLog.id}, ts: ${prevLog.timestamp}) 大于位置 ${i} 的日志 (ID: ${log.id}, ts: ${log.timestamp})`);
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
        sequence: lastLog.sequence 
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
        sequence: firstLog.sequence 
    };
};


// === 4. 模拟工具函数 (用于生成数据和 API 模拟) ===

let mockLogIdCounter = MAX_MOCK_HISTORY_SIZE;

const getLogColor = (level: LogLevel) => {
  switch (level) {
      case 'ERROR': return '\x1b[31m'; 
      case 'WARN': return '\x1b[33m'; 
      case 'INFO': return '\x1b[32m'; 
      case 'DEBUG': return '\x1b[90m'; 
      default: return '\x1b[0m'; 
  }
};

const formatLog = (item: Omit<LogItem, 'formattedMsg'>): string => {
  const reset = '\x1b[0m';
  const dim = '\x1b[90m'; 
  const color = getLogColor(item.level);

  // 格式化：时间戳 (ISO) + Sequence (4位)
  return [
      `${dim}${new Date(item.timestamp).toISOString()}${reset}`,
      `${dim}${item.sequence.toString().padStart(4, '0')}${reset}`,
      `\x1b[36m${item.serviceName.padEnd(12)}${reset}`, 
      `\x1b[34m${(item.userId || 'N/A').padEnd(8)}${reset}`, 
      `\x1b[35m${(item.groupId + '/' + item.clientId).padEnd(14)}${reset}`, 
      `${color}${item.level.padEnd(5)}${reset}`,
      `${item.message}`
  ].join('  ');
};

const mockLogGeneration = (id: number, timestamp: number, isHistorical: boolean): LogItem => {
    const level: LogLevel = ['INFO', 'INFO', 'INFO', 'DEBUG', 'WARN', 'ERROR'][Math.floor(Math.random() * 6)] as LogLevel;
    const serviceName = MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)];
    const userId = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    const groupId = MOCK_GROUPS[Math.floor(Math.random() * MOCK_GROUPS.length)];
    const clientId = MOCK_CLIENTS[Math.floor(Math.random() * MOCK_CLIENTS.length)];
    const message = isHistorical 
        ? `[History #${id}] Log message for ${serviceName} at level ${level}.`
        : `[LIVE #${id}] Processing request for ${userId || 'guest'}.`;
        
    // 生成 Sequence (0-999)
    const sequence = Math.floor(Math.random() * 1000); 
    
    const baseItem: Omit<LogItem, 'formattedMsg'> = {
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
const generateMockLogs = (count: number, startId: number, startTime: number): LogItem[] => {
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
const pullNewLogsMockAPI = (sinceTimestamp: number, limit: number): LogItem[] => {
    const newLogs: LogItem[] = [];
    const logCount = Math.min(limit, 10 + Math.floor(Math.random() * (limit - 10)));
    
    let currentTimestamp = sinceTimestamp; 
    
    for (let i = 0; i < logCount; i++) {
        currentTimestamp += 50 + Math.floor(Math.random() * 50); 
        mockLogIdCounter++; 
        
        const logItem = mockLogGeneration(mockLogIdCounter, currentTimestamp, false);
        
        // 模拟时间戳重复/交错的场景，使其与缓存末尾日志交错
        if (i > 0 && Math.random() < 0.1) {
             logItem.timestamp = newLogs[i-1].timestamp; 
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
const pullOlderLogsMockAPI = (startTime: number, endTime: number, limit: number): LogItem[] => {
    const olderLogs: LogItem[] = [];
    
    const logCount = Math.min(limit, 10 + Math.floor(Math.random() * (limit - 10)));
    const timeRange = endTime - startTime;
    
    for (let i = 0; i < logCount * 2; i++) { // 尝试生成更多日志以满足 limit
        
        // 在 [startTime, endTime] 范围内随机生成时间戳
        const logTimestamp = startTime + Math.random() * timeRange;
        
        // 模拟一个旧 ID (ID 从 1 到 MAX_MOCK_HISTORY_SIZE)
        const mockHistoricalId = 1 + Math.floor(Math.random() * MAX_MOCK_HISTORY_SIZE); 
        
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

export const useLogStore = defineStore('logTerminal', () => {
    // === 状态 State ===
    const initialLogs = generateMockLogs(500, MAX_MOCK_HISTORY_SIZE, Date.now() - 500 * 100).sort(logComparator);
    const allLogs = ref<LogItem[]>(initialLogs); 
    
    // 【修改】用于跟踪历史加载的最旧时间戳
    const oldestLogTimestamp = ref(initialLogs.length > 0 ? initialLogs[0].timestamp : Date.now()); 
    
    // 【合并字段】记录轮询的起始/当前位置时间戳
    // - 历史加载截断时：设置为截断位置的时间戳
    // - 每次轮询后：更新为本次获取的最新日志的时间戳
    // - 下次轮询时：从该时间戳继续，避免重复查询
    const lastPolledTimestamp = ref<number | null>(null);
    
    // 过滤状态
    const filterMode = ref<FilterMode>('ALL');
    const levelFilter = ref<string | null>(null); 
    const groupIdFilter = ref<string | null>(null);
    const clientIdFilter = ref<string | null>(null);
    const userIdFilter = ref<string | null>(null);

    // 轮询状态
    const isPollingError = ref(false);
    const retryCount = ref(0);
    const isFetchingHistory = ref(false);


    // === 计算属性 Getters ===
    
    const filteredLogs = computed(() => {
        return allLogs.value.filter(item => 
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
        return oldestLogTimestamp.value > (Date.now() - SIX_MONTHS_MS);
    });

    // === 动作 Actions ===

    const setFilterMode = (mode: FilterMode) => { filterMode.value = mode; };
    const setLevelFilter = (level: string | null) => { levelFilter.value = level; };
    const setGroupIdFilter = (id: string | null) => { groupIdFilter.value = id; };
    const setClientIdFilter = (id: string | null) => { clientIdFilter.value = id; };
    const setUserIdFilter = (id: string | null) => { userIdFilter.value = id; };
    
    const resetRetryState = () => { isPollingError.value = false; retryCount.value = 0; };
    
    const clearAllLogs = () => {
        allLogs.value = [];
        oldestLogTimestamp.value = Date.now(); // 重置最旧时间戳
        lastPolledTimestamp.value = null; // 清除已轮询时间戳
    };
    
    /**
     * 清除已轮询时间戳标记（恢复正常轮询，从缓存最新位置开始）
     */
    const clearLastPolledTimestamp = () => {
        lastPolledTimestamp.value = null;
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
     */
    const fetchOlderLogs = async (): Promise<number> => {
        if (!hasMoreHistory.value || isFetchingHistory.value) return 0;
        
        isFetchingHistory.value = true;
        await new Promise(resolve => setTimeout(resolve, 500)); 

        // 1. 确定查询范围
        const { timestamp: endTime } = getOldestLogTimeAndSequence(allLogs.value);
        const startTime = endTime - HISTORY_TIME_STEP; // 往前推一个时间步长 (1小时)
        
        // 模拟 API 查询
        const olderLogs = pullOlderLogsMockAPI(
            startTime, 
            endTime, 
            HISTORY_LIMIT
        );
        
        // 2. 去重和排序
        // 【修复】先对 olderLogs 内部去重（分布式场景下，同一批日志可能有重复 ID）
        const seenIdsInBatch = new Set<number>();
        const uniqueOlderLogsInBatch = olderLogs.filter(log => {
            if (seenIdsInBatch.has(log.id)) {
                console.warn(`历史日志批次中发现重复 ID: ${log.id}，已跳过`);
                return false;
            }
            seenIdsInBatch.add(log.id);
            return true;
        });
        
        // 对去重后的日志进行排序
        uniqueOlderLogsInBatch.sort(logComparator);
        
        // 与缓存中的日志去重
        const existingIds = new Set(allLogs.value.map(log => log.id));
        const uniqueOlderLogs = uniqueOlderLogsInBatch.filter(log => !existingIds.has(log.id));

        if (uniqueOlderLogs.length > 0) {
            // 3. 局部插入和排序：处理旧日志与现有缓存开头的交错
            insertLogsOrdered(allLogs, uniqueOlderLogs);
            
            // 4. 【更新】溢出处理：如果插入后超过上限，从最新端移除，并记录截断位置的时间戳
            if (allLogs.value.length > MAX_CACHE_SIZE) {
                const logsToRemove = allLogs.value.length - MAX_CACHE_SIZE;
                
                // 【修复】记录被截断位置的时间戳（截断前最新日志的时间戳），用于后续轮询从该位置继续
                // 确保数组不为空且索引有效
                if (allLogs.value.length > 0) {
                    const lastLogBeforeTruncate = allLogs.value[allLogs.value.length - 1];
                    if (lastLogBeforeTruncate) {
                        lastPolledTimestamp.value = lastLogBeforeTruncate.timestamp;
                    }
                }
                
                // 从最新的日志（末尾）开始移除
                allLogs.value.splice(MAX_CACHE_SIZE, logsToRemove); 
                console.warn(`加载历史日志后缓存溢出，已移除 ${logsToRemove} 条最新日志。截断位置时间戳: ${lastPolledTimestamp.value}`);
            }

            // 5. 更新最旧时间戳
            if (allLogs.value.length > 0) {
                 oldestLogTimestamp.value = allLogs.value[0].timestamp;
                 
                 // 【修复】确保 lastPolledTimestamp 不会小于 oldestLogTimestamp
                 // 如果 lastPolledTimestamp 存在且小于 oldestLogTimestamp，说明逻辑错误
                 if (lastPolledTimestamp.value !== null && lastPolledTimestamp.value < oldestLogTimestamp.value) {
                     console.warn(`lastPolledTimestamp (${lastPolledTimestamp.value}) 小于 oldestLogTimestamp (${oldestLogTimestamp.value})，清除 lastPolledTimestamp`);
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
    const pullAndProcessLogs = async (): Promise<{ newLogs: LogItem[], nextDelay: number }> => {
        let uniqueNewLogs: LogItem[] = [];
        let nextDelay = POLL_INTERVAL_BASE;
        
        try {
            if (Math.random() < 0.05 && retryCount.value < 3) {
                throw new Error("Simulated API failure.");
            }
            
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

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
            const uniqueFetchedLogsInBatch = fetchedLogs.filter(log => {
                if (seenIdsInBatch.has(log.id)) {
                    console.warn(`轮询日志批次中发现重复 ID: ${log.id}，已跳过`);
                    return false;
                }
                seenIdsInBatch.add(log.id);
                return true;
            });
            
            // 对去重后的日志进行排序
            uniqueFetchedLogsInBatch.sort(logComparator);
            
            // 与缓存中的日志去重
            const existingIds = new Set(allLogs.value.map(log => log.id));
            uniqueNewLogs = uniqueFetchedLogsInBatch.filter(log => !existingIds.has(log.id));

            if (uniqueNewLogs.length > 0) {
                // 1. 局部插入和排序：处理新日志与现有缓存末尾的交错
                insertLogsOrdered(allLogs, uniqueNewLogs);
                
                // 2. 【更新】更新已轮询到的最新时间戳（使用本次获取的最新日志的时间戳）
                // 【修复】确保数组不为空
                if (uniqueNewLogs.length > 0) {
                    const latestNewLog = uniqueNewLogs[uniqueNewLogs.length - 1];
                    const previousPolledTimestamp = lastPolledTimestamp.value;
                    lastPolledTimestamp.value = latestNewLog.timestamp;
                    console.log(`轮询成功，更新已轮询时间戳: ${lastPolledTimestamp.value}`);
                    
                    // 3. 【检查】如果之前存在 lastPolledTimestamp（说明正在追回数据），
                    // 且本次获取的日志时间戳已经接近当前时间（说明已经追回所有数据），
                    // 可以清除 lastPolledTimestamp，恢复正常轮询（从缓存最新位置开始）
                    if (previousPolledTimestamp !== null) {
                        const now = Date.now();
                        const timeDiff = now - lastPolledTimestamp.value;
                        // 如果最新日志时间戳已经接近当前时间（差距小于轮询间隔的2倍），说明已经追回
                        if (timeDiff < POLL_INTERVAL_BASE * 2) {
                            console.log(`已追回所有数据，恢复正常轮询。最新日志时间戳: ${lastPolledTimestamp.value}, 当前时间: ${now}`);
                            lastPolledTimestamp.value = null;
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

            // 2. 【溢出处理：从最旧端移除】
            if (allLogs.value.length > MAX_CACHE_SIZE) {
                const logsToRemove = allLogs.value.length - MAX_CACHE_SIZE;
                allLogs.value.splice(0, logsToRemove); // 从最旧的日志（开头）开始移除
                
                // 3. 【更新历史游标】
                if (allLogs.value.length > 0) {
                    // 更新 oldestLogTimestamp 为新的最旧日志的时间戳
                    oldestLogTimestamp.value = allLogs.value[0].timestamp;
                    
                    // 【修复】确保 lastPolledTimestamp 不会小于 oldestLogTimestamp
                    // 如果 lastPolledTimestamp 存在且小于新的 oldestLogTimestamp，说明它指向的日志已被移除
                    // 应该清除它，恢复正常轮询
                    if (lastPolledTimestamp.value !== null && lastPolledTimestamp.value < oldestLogTimestamp.value) {
                        console.warn(`lastPolledTimestamp (${lastPolledTimestamp.value}) 小于 oldestLogTimestamp (${oldestLogTimestamp.value})，清除 lastPolledTimestamp`);
                        lastPolledTimestamp.value = null;
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
            // 失败后，下次轮询间隔加倍
            nextDelay = POLL_INTERVAL_BASE * Math.pow(2, retryCount.value); 
        }

        return { newLogs: uniqueNewLogs, nextDelay };
    };
    
    
    /**
     * 模拟导出所有日志为 JSON 或其他格式。
     */
    const exportAllLogs = () => {
        const json = JSON.stringify(allLogs.value, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
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
        validateLogsOrderedAndUnique: () => validateLogsOrderedAndUnique(allLogs.value),
    };
});