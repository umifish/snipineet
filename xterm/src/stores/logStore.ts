import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// === 类型定义 ===
export interface LogItem {
    id: number;
    timestamp: number;
    serviceName: string;
    userId: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    formattedMsg: string; 
}

// === 模拟 API 调用 ===

function formatLogMessage(timestamp: number, serviceName: string, userId: string, level: string, message: string): string {
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

    return `${colors.GRAY}${timeStr.padEnd(10)}\x1b[0m ` +
           `\x1b[35m${serviceName.padEnd(12)}\x1b[0m ` + 
           `\x1b[36m${userId.padEnd(12)}\x1b[0m ` +      
           `${levelColor}${level.padEnd(6)}${colors.RESET} ` +        
           `${message}`;
}

const mockLogs = (startId: number, count: number): LogItem[] => {
    const logs: LogItem[] = [];
    const services = ['AuthService', 'Gateway', 'Payment', 'Inventory'];
    const users = ['admin', 'userA', 'userB', 'guest'];
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
        const level = levels[Math.floor(Math.random() * levels.length)];
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        const formattedMsg = formatLogMessage(timestamp, serviceName, userId, level, message + ` (ID: ${id})`);
        
        logs.push({
            id,
            timestamp,
            serviceName,
            userId,
            level,
            message,
            formattedMsg
        });
    }
    return logs;
};

const INITIAL_LOG_COUNT = 5000; 
const INITIAL_LOG_OFFSET = 10000; 
// 定义模拟历史的绝对起点，用于 API 终止判断
const TRUE_START_ID = 1; 

const mockFetchOlderLogs = (beforeId: number, count: number): LogItem[] => {
    
    // 场景 1: 缓存已清除 (beforeId=0)，加载初始数据
    if (beforeId === 0) {
        return mockLogs(INITIAL_LOG_OFFSET, INITIAL_LOG_COUNT);
    }
    
    // 场景 2: 已到达绝对起点，返回空数组（不再依赖 ID 值是否为 1）
    if (beforeId <= TRUE_START_ID) {
        return []; 
    }
    
    // 场景 3: 正常加载
    const startId = Math.max(TRUE_START_ID, beforeId - count);
    const numToFetch = beforeId - startId;
    return mockLogs(startId, numToFetch);
};

const mockPullNewLogs = (lastId: number): LogItem[] => {
    const newLogsCount = Math.floor(Math.random() * 5) + 5; 
    if (newLogsCount === 0) return [];
    
    const logs = mockLogs(lastId + 1, newLogsCount);
    return logs;
};

// === Pinia Store ===
export const useLogStore = defineStore('log', () => {
    
    const allLogs = ref<LogItem[]>(mockLogs(INITIAL_LOG_OFFSET, INITIAL_LOG_COUNT));
    
    // 筛选条件
    const userIdFilter = ref<string | null>(null);
    const levelFilter = ref<string | null>(null); 
    
    // 状态
    const isFetchingHistory = ref(false);
    // 标记是否已通过接口查询确认历史数据已全部加载
    const historyExhausted = ref(false); 

    // 计算属性: 过滤后的日志
    const filteredLogs = computed(() => {
        let logs = allLogs.value;

        if (userIdFilter.value) {
            logs = logs.filter(log => log.userId === userIdFilter.value);
        }

        if (levelFilter.value) {
            logs = logs.filter(log => log.level === levelFilter.value);
        }
        
        return logs;
    });

    // 计算属性: 统计信息
    const totalCount = computed(() => allLogs.value.length);
    const filteredCount = computed(() => filteredLogs.value.length);
    const latestLogId = computed(() => allLogs.value.length > 0 ? allLogs.value[allLogs.value.length - 1].id : 0);
    const earliestLogId = computed(() => allLogs.value.length > 0 ? allLogs.value[0].id : 0);
    
    const hasMoreHistory = computed(() => {
        // 缓存为空时，始终允许加载初始数据
        if (allLogs.value.length === 0) {
            return true; 
        }
        // 只有当接口未明确返回历史耗尽时，才允许继续加载
        return !historyExhausted.value;
    });

    // --- Actions ---

    const getLogSlice = (start: number, size: number): LogItem[] => {
        const logs = filteredLogs.value;
        const total = logs.length;
        
        const startIndex = Math.max(0, Math.min(start, total - 1));
        
        return logs.slice(startIndex, startIndex + size);
    };

    const pullAndProcessLogs = async (): Promise<LogItem[]> => {
        const newLogs = mockPullNewLogs(latestLogId.value);
        if (newLogs.length > 0) {
            allLogs.value.push(...newLogs);
            // 限制缓存大小
            if (allLogs.value.length > 20000) {
                allLogs.value = allLogs.value.slice(allLogs.value.length - 20000);
            }
        }
        return newLogs;
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
            // 如果接口返回 0 条日志，且这不是初始加载尝试 (beforeId > 0)，则确认历史耗尽。
            if (beforeId > 0) {
                historyExhausted.value = true;
            }
            return 0;
        }
    };

    const setUserIdFilter = (userId: string | null) => {
        userIdFilter.value = userId;
    };
    
    const setLevelFilter = (level: string | null) => {
        levelFilter.value = level;
    };

    const clearAllLogs = () => {
        allLogs.value = [];
        userIdFilter.value = null;
        levelFilter.value = null;
        historyExhausted.value = false;
    };

    const exportAllLogs = () => {
        const content = allLogs.value.map(log => 
            `${new Date(log.timestamp).toISOString()} [${log.level}] ${log.serviceName} (${log.userId}): ${log.message}`
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
        console.log("Logs exported.");
    };

    return {
        allLogs,
        filteredLogs,
        userIdFilter,
        levelFilter,
        isFetchingHistory,
        historyExhausted, 
        totalCount,
        filteredCount,
        hasMoreHistory,
        getLogSlice,
        pullAndProcessLogs,
        fetchOlderLogs,
        setUserIdFilter,
        setLevelFilter,
        clearAllLogs,
        exportAllLogs
    };
});