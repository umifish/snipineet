import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// === 1. 类型和常量定义 ===

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
export type FilterMode = 'ALL' | 'NONE' | 'LEVEL' | 'GROUP_ID' | 'CLIENT_ID' | 'USER_ID';

export interface LogItem {
    id: number;
    timestamp: number; // Unix timestamp in ms
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
const MAX_MOCK_HISTORY_SIZE = 50000; // 模拟的总历史日志条数
const HISTORY_PAGE_SIZE = 1000;      // 每次加载历史的页大小

// 模拟的用户和 ID
const MOCK_USERS = ['admin', 'userA', 'userB', null];
const MOCK_SERVICES = ['AuthService', 'DataProcessor', 'Gateway', 'Analytics'];
const MOCK_GROUPS = ['A100', 'B200', 'C300'];
const MOCK_CLIENTS = ['ClientX', 'ClientY', 'ClientZ'];


// === 2. 通用过滤逻辑抽象 ===

/**
 * 根据当前的过滤模式和参数，判断单个 LogItem 是否应该被显示。
 * @param item - 要检查的日志项。
 * @param mode - 当前的过滤模式。
 * @param levelFilter - 级别过滤器。
 * @param groupIdFilter - 组ID过滤器。
 * @param clientIdFilter - 客户端ID过滤器。
 * @param userIdFilter - 用户ID过滤器。
 * @returns boolean - true 表示应该显示，false 表示应该隐藏。
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


// === 3. 模拟工具函数 (用于生成数据) ===

let mockLogIdCounter = MAX_MOCK_HISTORY_SIZE;

const getLogColor = (level: LogLevel) => {
  switch (level) {
      case 'ERROR': return '\x1b[31m'; // Red (Error)
      case 'WARN': return '\x1b[33m'; // Yellow (Warning)
      case 'INFO': return '\x1b[32m'; // Green (NEW: Map INFO to Green for Success tone)
      case 'DEBUG': return '\x1b[90m'; // Bright Black/Dim (NEW: Map DEBUG to Dim/Low Priority)
      default: return '\x1b[0m'; // Reset
  }
};

const formatLog = (item: Omit<LogItem, 'formattedMsg'>): string => {
  const reset = '\x1b[0m';
  const dim = '\x1b[90m'; // 映射到 brightBlack (中灰/浅色模式下的时间戳颜色)
  const color = getLogColor(item.level);

  // [列]            [ANSI 颜色] [映射到的 Xterm 主题颜色]
  return [
      `${dim}${new Date(item.timestamp).toISOString()}${reset}`,
      `\x1b[36m${item.serviceName.padEnd(12)}${reset}`, // Cyan (Service Name)
      `\x1b[34m${(item.userId || 'N/A').padEnd(8)}${reset}`, // Blue (User ID)
      `\x1b[35m${(item.groupId + '/' + item.clientId).padEnd(14)}${reset}`, // Magenta (Group/Client ID)
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
    
    const baseItem: Omit<LogItem, 'formattedMsg'> = {
        id,
        timestamp,
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

const generateMockLogs = (count: number, startId: number, startTime: number, isHistorical: boolean = false): LogItem[] => {
    const logs: LogItem[] = [];
    for (let i = 0; i < count; i++) {
        const id = startId + i;
        const timestamp = startTime + i * (isHistorical ? -100 : 100); // 历史日志时间倒序
        logs.push(mockLogGeneration(id, timestamp, isHistorical));
    }
    return logs;
};


// === 4. Pinia Store 定义 ===

export const useLogStore = defineStore('logTerminal', () => {
    // === 状态 State ===
    const logCache = ref<LogItem[]>(generateMockLogs(500, 1, Date.now() - 500 * 100)); // 初始缓存
    const nextHistoryIdToLoad = ref(MAX_MOCK_HISTORY_SIZE + 1);
    const lastPolledId = ref(mockLogIdCounter);

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
    
    // 💡 【关键】使用 shouldLogBeDisplayed 来计算过滤后的日志
    const filteredLogs = computed(() => {
        // 传递所有需要的过滤状态给通用函数
        return logCache.value.filter(item => 
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

    const totalCount = computed(() => logCache.value.length);
    const filteredCount = computed(() => filteredLogs.value.length);

    // 检查是否还有更旧的日志可以加载
    const hasMoreHistory = computed(() => nextHistoryIdToLoad.value > 1);


    // === 动作 Actions ===

    const setFilterMode = (mode: FilterMode) => { filterMode.value = mode; };
    const setLevelFilter = (level: string | null) => { levelFilter.value = level; };
    const setGroupIdFilter = (id: string | null) => { groupIdFilter.value = id; };
    const setClientIdFilter = (id: string | null) => { clientIdFilter.value = id; };
    const setUserIdFilter = (id: string | null) => { userIdFilter.value = id; };
    
    const resetRetryState = () => { isPollingError.value = false; retryCount.value = 0; };
    
    const clearAllLogs = () => {
        logCache.value = [];
        // 清除缓存也应该重置历史指针，但保持 ID 计数器递增
        // nextHistoryIdToLoad.value = MAX_MOCK_HISTORY_SIZE + 1; 
        // lastPolledId.value = mockLogIdCounter;
    };


    /**
     * 获取过滤后日志的切片，用于虚拟滚动。
     */
    const getLogSlice = (start: number, size: number): LogItem[] => {
        return filteredLogs.value.slice(start, start + size);
    };


    /**
     * 模拟加载更旧的历史日志。
     */
    const fetchOlderLogs = async (): Promise<number> => {
        if (!hasMoreHistory.value || isFetchingHistory.value) return 0;
        
        isFetchingHistory.value = true;
        await new Promise(resolve => setTimeout(resolve, 500)); // 模拟网络延迟

        const startId = Math.max(1, nextHistoryIdToLoad.value - HISTORY_PAGE_SIZE);
        const count = nextHistoryIdToLoad.value - startId;
        
        // 模拟时间倒序
        const startTime = Date.now() - (MAX_MOCK_HISTORY_SIZE - startId) * 1000; 

        if (count > 0) {
            const olderLogs = generateMockLogs(count, startId, startTime, true);
            
            // 将旧日志添加到缓存的开头
            logCache.value.unshift(...olderLogs);
            
            // 更新下次加载的ID
            nextHistoryIdToLoad.value = startId;

            isFetchingHistory.value = false;
            return count;
        }

        isFetchingHistory.value = false;
        return 0;
    };


    /**
     * 模拟轮询获取新日志并处理缓存溢出。
     */
    const pullAndProcessLogs = async (): Promise<{ newLogs: LogItem[], nextDelay: number }> => {
        let newLogs: LogItem[] = [];
        let nextDelay = POLL_INTERVAL_BASE;
        
        try {
            // 模拟 API 失败
            if (Math.random() < 0.05 && retryCount.value < 3) {
                throw new Error("Simulated API failure.");
            }
            
            // 模拟 API 延迟
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

            // 模拟生成 5-15 条新日志
            const newLogCount = 5 + Math.floor(Math.random() * 10);
            mockLogIdCounter += newLogCount;
            const startId = lastPolledId.value + 1;
            
            newLogs = generateMockLogs(newLogCount, startId, Date.now());
            
            // 更新 ID 和缓存
            lastPolledId.value = mockLogIdCounter;
            logCache.value.push(...newLogs);

            isPollingError.value = false;
            retryCount.value = 0; // 成功则重置重试计数

            // 缓存溢出处理
            if (logCache.value.length > MAX_CACHE_SIZE) {
                const logsToRemove = logCache.value.length - MAX_CACHE_SIZE;
                logCache.value.splice(0, logsToRemove);
                
                // 如果是历史模式，需要调整历史指针
                if (nextHistoryIdToLoad.value <= logsToRemove) {
                    nextHistoryIdToLoad.value = 1; // 溢出太多，历史加载到底
                } else {
                    nextHistoryIdToLoad.value -= logsToRemove;
                }
            }
            
        } catch (error) {
            console.error("Polling failed:", error);
            isPollingError.value = true;
            retryCount.value++;
            // 失败后，下次轮询间隔加倍
            nextDelay = POLL_INTERVAL_BASE * Math.pow(2, retryCount.value); 
        }

        return { newLogs, nextDelay };
    };
    
    
    /**
     * 模拟导出所有日志为 JSON 或其他格式。
     */
    const exportAllLogs = () => {
        const json = JSON.stringify(logCache.value, null, 2);
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
        logCache,
        filterMode,
        levelFilter,
        groupIdFilter,
        clientIdFilter,
        userIdFilter,
        isPollingError,
        retryCount,
        isFetchingHistory,
        
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
        fetchOlderLogs,
        pullAndProcessLogs,
        getLogSlice,
        exportAllLogs,
    };
});