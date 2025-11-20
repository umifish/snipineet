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
    formattedMsg: string; // 包含 ANSI 颜色的格式化字符串
}

// === 模拟 API 调用 ===

function formatLogMessage(timestamp: number, serviceName: string, userId: string, level: string, message: string): string {
    const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
    
    // ANSI 颜色代码定义
    const colors = {
        INFO: '\x1b[32m',    
        WARN: '\x1b[33m',    
        ERROR: '\x1b[31m',   
        DEBUG: '\x1b[36m',   
        RESET: '\x1b[0m',
        GRAY: '\x1b[90m',
        // BOLD: '\x1b[1m' // 头部已分离，不再需要 BOLD 效果
    };

    const levelColor = colors[level as keyof typeof colors] || colors.RESET;

    // 使用更窄的填充宽度 (10, 12, 12, 6) 提高终端的兼容性
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

// 初始加载历史日志
const INITIAL_LOG_COUNT = 1000;
const INITIAL_LOG_OFFSET = 10000; // 从 10000 号日志开始模拟

let currentLogId = INITIAL_LOG_OFFSET + INITIAL_LOG_COUNT; // 下一个新日志的 ID

// 模拟获取历史日志
const mockFetchOlderLogs = (beforeId: number, count: number): LogItem[] => {
    if (beforeId <= 1) return []; 
    const startId = Math.max(1, beforeId - count);
    const numToFetch = beforeId - startId;
    return mockLogs(startId, numToFetch);
};

// 模拟获取新日志
const mockPullNewLogs = (lastId: number): LogItem[] => {
    const newLogsCount = Math.floor(Math.random() * 5) + 5; // 每次获取 5-9 条新日志
    if (newLogsCount === 0) return [];
    
    const logs = mockLogs(lastId + 1, newLogsCount);
    currentLogId += newLogsCount;
    return logs;
};

// === Pinia Store ===
export const useLogStore = defineStore('log', () => {
    // 原始日志数据 (有序)
    const allLogs = ref<LogItem[]>(mockLogs(INITIAL_LOG_OFFSET, INITIAL_LOG_COUNT));
    
    // 筛选条件
    const userIdFilter = ref<string | null>(null);

    // 状态
    const isFetchingHistory = ref(false);

    // 计算属性: 过滤后的日志
    const filteredLogs = computed(() => {
        if (!userIdFilter.value) {
            return allLogs.value;
        }
        return allLogs.value.filter(log => log.userId === userIdFilter.value);
    });

    // 计算属性: 统计信息
    const totalCount = computed(() => allLogs.value.length);
    const filteredCount = computed(() => filteredLogs.value.length);
    const latestLogId = computed(() => allLogs.value.length > 0 ? allLogs.value[allLogs.value.length - 1].id : 0);
    const earliestLogId = computed(() => allLogs.value.length > 0 ? allLogs.value[0].id : 0);

    // 检查是否有更旧的历史可以加载
    const hasMoreHistory = computed(() => earliestLogId.value > 1);

    // 距最新日志的差距 (用于历史回溯模式)
    const gapToLatestLog = computed(() => currentLogId - latestLogId.value);


    // --- Actions ---

    const getLogSlice = (start: number, size: number): LogItem[] => {
        const logs = filteredLogs.value;
        const total = logs.length;
        
        // 确保 start 不小于 0 且不超过最大索引
        const startIndex = Math.max(0, Math.min(start, total - 1));
        
        // slice(start, end)
        return logs.slice(startIndex, startIndex + size);
    };

    const pullAndProcessLogs = async (): Promise<LogItem[]> => {
        const newLogs = mockPullNewLogs(latestLogId.value);
        if (newLogs.length > 0) {
            // 合并新日志，保持顺序
            allLogs.value.push(...newLogs);
            // 保持缓存大小 (例如，最多 20000 条)
            if (allLogs.value.length > 20000) {
                allLogs.value = allLogs.value.slice(allLogs.value.length - 20000);
            }
        }
        return newLogs;
    };

    const fetchOlderLogs = async (): Promise<number> => {
        if (!hasMoreHistory.value) return 0;

        isFetchingHistory.value = true;
        
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const olderLogs = mockFetchOlderLogs(earliestLogId.value, 1000);
        isFetchingHistory.value = false;

        if (olderLogs.length > 0) {
            // 将旧日志放在数组头部
            allLogs.value.unshift(...olderLogs);
            return olderLogs.length;
        }
        return 0;
    };

    const setUserIdFilter = (userId: string | null) => {
        userIdFilter.value = userId;
    };

    const clearAllLogs = () => {
        allLogs.value = [];
        // 重置 ID，模拟清空缓存
        currentLogId = INITIAL_LOG_OFFSET;
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
        isFetchingHistory,
        totalCount,
        filteredCount,
        hasMoreHistory,
        gapToLatestLog,
        getLogSlice,
        pullAndProcessLogs,
        fetchOlderLogs,
        setUserIdFilter,
        clearAllLogs,
        exportAllLogs
    };
});