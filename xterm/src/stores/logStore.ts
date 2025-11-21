import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// === 类型定义 ===
export interface LogItem {
    id: number;
    timestamp: number;
    serviceName: string;
    userId: string;
    // 新增字段
    groupId: string;
    clientId: string;
    
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    formattedMsg: string; 
}

export type FilterMode = 'NONE' | 'ALL' | 'LEVEL' | 'GROUP_ID' | 'CLIENT_ID' | 'USER_ID';

// === 常量与配置 ===
export const MAX_CACHE_SIZE = 20000; // 缓存日志的最大容量
const MAX_RETRIES = 10;             // 最大重试次数
const DEFAULT_POLL_DELAY = 2000;    // 默认轮询间隔 (2秒)

const INITIAL_LOG_COUNT = 5000; 
const INITIAL_LOG_OFFSET = 10000; 
const TRUE_START_ID = 1; 

// === 模拟 API 调用 ===

function formatLogMessage(timestamp: number, serviceName: string, userId: string, groupId: string, clientId: string, level: string, message: string): string {
    const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
    
    const colors = {
        INFO: '\x1b[32m',    
        WARN: '\x1b[33m',    
        ERROR: '\x1b[31m',   
        DEBUG: '\x1b[36m',   
        RESET: '\x1b[0m',
        GRAY: '\x1b[90m', 
    };

    const levelColor = colors[level as keyof typeof colors] || colors.RESET;

    // 格式化包含 Group 和 Client 信息
    return `${colors.GRAY}${timeStr.padEnd(10)}\x1b[0m ` +
           `\x1b[35m${serviceName.padEnd(12)}\x1b[0m ` + 
           `\x1b[36m${userId.padEnd(10)}\x1b[0m ` +      
           `\x1b[90m[${groupId}|${clientId}]\x1b[0m ` + 
           `${levelColor}${level.padEnd(6)}${colors.RESET} ` +        
           `${message}`;
}

const mockLogs = (startId: number, count: number): LogItem[] => {
    const logs: LogItem[] = [];
    const services = ['AuthService', 'Gateway', 'Payment', 'Inventory'];
    const users = ['admin', 'userA', 'userB', 'guest'];
    const groups = ['g-dev', 'g-ops', 'g-test'];
    const clients = ['web', 'ios', 'android'];
    const levels: ('INFO' | 'WARN' | 'ERROR' | 'DEBUG')[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
    const messages = [
        'Request processed successfully.',
        'User logged out.',
        'Database connection timeout.',
        'Item added to cart.',
        'DEBUG: Cache read latency is high.'
    ];

    for (let i = 0; i < count; i++) {
        const id = startId + i;
        const timestamp = Date.now() - (count - i) * 1000 + Math.random() * 500;
        const serviceName = services[Math.floor(Math.random() * services.length)];
        const userId = users[Math.floor(Math.random() * users.length)];
        const groupId = groups[Math.floor(Math.random() * groups.length)];
        const clientId = clients[Math.floor(Math.random() * clients.length)];
        const level = levels[Math.floor(Math.random() * levels.length)];
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        const formattedMsg = formatLogMessage(timestamp, serviceName, userId, groupId, clientId, level, message + ` (ID: ${id})`);
        
        logs.push({
            id,
            timestamp,
            serviceName,
            userId,
            groupId,
            clientId,
            level,
            message,
            formattedMsg
        });
    }
    return logs;
};

const mockFetchOlderLogs = (beforeId: number, count: number): LogItem[] => {
    // 场景 1: 缓存已清除 (beforeId=0)，加载初始数据
    if (beforeId === 0) {
        return mockLogs(INITIAL_LOG_OFFSET, INITIAL_LOG_COUNT);
    }
    // 场景 2: 已到达绝对起点
    if (beforeId <= TRUE_START_ID) {
        return []; 
    }
    // 场景 3: 正常加载
    const startId = Math.max(TRUE_START_ID, beforeId - count);
    const numToFetch = beforeId - startId;
    return mockLogs(startId, numToFetch);
};

const mockPullNewLogs = (lastId: number): LogItem[] => {
    // 模拟 5% 的网络/API 失败概率
    if (Math.random() < 0.05) { 
        throw new Error("Simulated network failure or API exception.");
    }
    
    const newLogsCount = Math.floor(Math.random() * 5) + 5; 
    if (newLogsCount === 0) return [];
    
    const logs = mockLogs(lastId + 1, newLogsCount);
    return logs;
};

// === Pinia Store ===
export const useLogStore = defineStore('log', () => {
    
    const allLogs = ref<LogItem[]>(mockLogs(INITIAL_LOG_OFFSET, INITIAL_LOG_COUNT));
    
    // 筛选状态
    const filterMode = ref<FilterMode>('ALL');
    const userIdFilter = ref<string | null>(null);
    const levelFilter = ref<string | null>(null); 
    const groupIdFilter = ref<string | null>(null);
    const clientIdFilter = ref<string | null>(null);
    
    // 运行状态
    const isFetchingHistory = ref(false);
    const historyExhausted = ref(false); 
    
    // 重试状态
    const retryCount = ref(0);
    const isPollingError = ref(false); 

    // === 计算属性: 过滤逻辑 ===
    const filteredLogs = computed(() => {
        const mode = filterMode.value;
        const logs = allLogs.value;

        if (mode === 'NONE') {
            return logs;
        }

        return logs.filter(log => {
            // ALL: 交集
            if (mode === 'ALL') {
                let match = true;
                if (levelFilter.value) match = match && log.level === levelFilter.value;
                if (groupIdFilter.value) match = match && log.groupId.includes(groupIdFilter.value);
                if (clientIdFilter.value) match = match && log.clientId.includes(clientIdFilter.value);
                if (userIdFilter.value) match = match && log.userId === userIdFilter.value;
                return match;
            }

            // 单一模式
            if (mode === 'LEVEL') {
                return levelFilter.value ? log.level === levelFilter.value : true;
            }
            if (mode === 'GROUP_ID') {
                return groupIdFilter.value ? log.groupId.includes(groupIdFilter.value) : true;
            }
            if (mode === 'CLIENT_ID') {
                return clientIdFilter.value ? log.clientId.includes(clientIdFilter.value) : true;
            }
            if (mode === 'USER_ID') {
                return userIdFilter.value ? log.userId === userIdFilter.value : true;
            }

            return true;
        });
    });

    // 统计信息
    const totalCount = computed(() => allLogs.value.length);
    const filteredCount = computed(() => filteredLogs.value.length);
    const latestLogId = computed(() => allLogs.value.length > 0 ? allLogs.value[allLogs.value.length - 1].id : 0);
    const earliestLogId = computed(() => allLogs.value.length > 0 ? allLogs.value[0].id : 0);
    
    const hasMoreHistory = computed(() => {
        if (allLogs.value.length === 0) return true; 
        return !historyExhausted.value;
    });

    // --- Actions ---

    const getLogSlice = (start: number, size: number): LogItem[] => {
        const logs = filteredLogs.value;
        const total = logs.length;
        const startIndex = Math.max(0, Math.min(start, total - 1));
        return logs.slice(startIndex, startIndex + size);
    };
    
    const getNextRetryDelay = (count: number): number => {
        const baseDelay = Math.min(30000, DEFAULT_POLL_DELAY * Math.pow(2, count - 1));
        const jitter = Math.random() * 1000; 
        return Math.floor(baseDelay + jitter);
    }
    
    const pullAndProcessLogs = async (): Promise<{ newLogs: LogItem[], nextDelay: number }> => {
        if (isPollingError.value) {
            return { newLogs: [], nextDelay: getNextRetryDelay(retryCount.value) };
        }
        
        try {
            const newLogs = mockPullNewLogs(latestLogId.value);
            
            if (newLogs.length > 0) {
                allLogs.value.push(...newLogs);
                if (allLogs.value.length > MAX_CACHE_SIZE) {
                    allLogs.value = allLogs.value.slice(allLogs.value.length - MAX_CACHE_SIZE);
                }
            }
            
            if (retryCount.value > 0) {
                console.log(`Polling succeeded after ${retryCount.value} retries.`);
            }
            retryCount.value = 0;
            return { newLogs, nextDelay: DEFAULT_POLL_DELAY };

        } catch (e: any) {
            retryCount.value++;
            if (retryCount.value >= MAX_RETRIES) {
                isPollingError.value = true;
            }
            const delay = getNextRetryDelay(retryCount.value);
            return { newLogs: [], nextDelay: delay };
        }
    };

    const fetchOlderLogs = async (): Promise<number> => {
        if (isFetchingHistory.value || (historyExhausted.value && allLogs.value.length > 0)) return 0;

        isFetchingHistory.value = true;
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const beforeId = earliestLogId.value;
        const olderLogs = mockFetchOlderLogs(beforeId, 1000);
        isFetchingHistory.value = false;

        if (olderLogs.length > 0) {
            allLogs.value.unshift(...olderLogs);
            historyExhausted.value = false; 
            return olderLogs.length;
        } else {
            if (beforeId > 0) {
                historyExhausted.value = true;
            }
            return 0;
        }
    };
    
    const resetRetryState = () => {
        retryCount.value = 0;
        isPollingError.value = false;
    };

    // Setters
    const setFilterMode = (mode: FilterMode) => { filterMode.value = mode; };
    const setUserIdFilter = (val: string | null) => { userIdFilter.value = val; };
    const setLevelFilter = (val: string | null) => { levelFilter.value = val; };
    const setGroupIdFilter = (val: string | null) => { groupIdFilter.value = val; };
    const setClientIdFilter = (val: string | null) => { clientIdFilter.value = val; };

    const clearAllLogs = () => {
        allLogs.value = [];
        userIdFilter.value = null;
        levelFilter.value = null;
        groupIdFilter.value = null;
        clientIdFilter.value = null;
        historyExhausted.value = false;
        resetRetryState();
    };

    const exportAllLogs = () => {
        const content = allLogs.value.map(log => 
            `${new Date(log.timestamp).toISOString()} [${log.level}] [${log.groupId}|${log.clientId}] ${log.serviceName} (${log.userId}): ${log.message}`
        ).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `log_export_${new Date().toISOString()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return {
        allLogs,
        filteredLogs,
        // State
        filterMode,
        userIdFilter,
        levelFilter,
        groupIdFilter,
        clientIdFilter,
        isFetchingHistory,
        historyExhausted, 
        totalCount,
        filteredCount,
        hasMoreHistory,
        retryCount,
        isPollingError,
        // Actions
        getLogSlice,
        pullAndProcessLogs,
        resetRetryState,
        fetchOlderLogs,
        setFilterMode,
        setUserIdFilter,
        setLevelFilter,
        setGroupIdFilter,
        setClientIdFilter,
        clearAllLogs,
        exportAllLogs
    };
});