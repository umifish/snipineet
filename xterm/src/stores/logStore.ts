import { defineStore } from 'pinia';

// === 1. 类型定义 ===
export interface LogItem {
    id: number;
    timestamp: string;
    service: string;
    userId: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    // 经过 ANSI 格式化后的消息，用于 Xterm.js 渲染
    formattedMsg: string; 
}

// === 2. 辅助函数：模拟和格式化日志 ===

const LOG_LEVELS = [
    { level: 'INFO', color: '\x1b[32m' }, // Green
    { level: 'WARN', color: '\x1b[33m' }, // Yellow
    { level: 'ERROR', color: '\x1b[31m' } // Red
];
const SERVICES = ['AuthService', 'DataProcessor', 'LogGenerator', 'WebServer'];
const USERS = ['admin', 'guest', 'api-user', 'system'];

/**
 * 格式化日志为 Xterm.js 可识别的 ANSI 字符串
 * @param log LogItem 对象
 * @returns 格式化后的字符串
 */
function formatLogForTerminal(log: LogItem): string {
    const levelData = LOG_LEVELS.find(l => l.level === log.level)!;
    
    // 统一列宽
    const levelStr = `${levelData.color}${log.level.padEnd(7)}\x1b[0m`;
    const serviceStr = `\x1b[35m${log.service.padEnd(14)}\x1b[0m`;
    const userStr = `\x1b[36m${log.userId.padEnd(14)}\x1b[0m`;
    const timeStr = `\x1b[37m${log.timestamp.padEnd(12)}\x1b[0m`;

    return `${timeStr} ${serviceStr} ${userStr} ${levelStr} ${log.message}`;
}

/**
 * 模拟生成一条新的日志记录
 * @param id 日志ID
 * @returns LogItem
 */
function generateNewLog(id: number): LogItem {
    const levelObj = LOG_LEVELS[Math.floor(Math.random() * LOG_LEVELS.length)];
    const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
    const user = USERS[Math.floor(Math.random() * USERS.length)];
    
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false });
    
    const message = `Processing request for ${service}. Status code ${Math.floor(Math.random() * 500) + 100}.`;

    const log: LogItem = {
        id,
        timestamp,
        service,
        userId: user,
        level: levelObj.level as LogItem['level'],
        message,
        formattedMsg: '' // 稍后设置
    };
    log.formattedMsg = formatLogForTerminal(log);
    return log;
}


// === 3. Pinia Store 定义 ===

export const useLogStore = defineStore('log', {
    state: () => ({
        logs: [] as LogItem[],
        totalCount: 0,
        lastLogId: 0,
        maxBufferSize: 50000, // 最大日志缓存量
    }),
    
    actions: {
        /**
         * @action 1: 模拟从后端拉取新日志并处理
         * @returns 新增的日志数组
         */
        async pullAndProcessLogs(): Promise<LogItem[]> {
            // 模拟每次拉取 5-30 条新日志
            const count = Math.floor(Math.random() * 21) + 5;
            const newLogs: LogItem[] = [];
            
            for (let i = 0; i < count; i++) {
                this.lastLogId++;
                newLogs.push(generateNewLog(this.lastLogId));
            }

            // 添加到日志数组，并强制保持最大缓存限制
            this.logs.push(...newLogs);
            
            if (this.logs.length > this.maxBufferSize) {
                // 移除最旧的日志
                this.logs.splice(0, this.logs.length - this.maxBufferSize);
            }
            
            this.totalCount = this.logs.length;
            
            return newLogs;
        },

        /**
         * @action 2: 获取日志数据的切片 (用于终端渲染)
         * @param start 起始索引
         * @param length 长度
         * @param filterUser 可选的用户ID过滤
         * @returns LogItem[]
         */
        getLogSlice(start: number, length: number, filterUser: string | null): LogItem[] {
            const effectiveStart = Math.max(0, start);
            const effectiveEnd = effectiveStart + length;

            // 注意：这里基于原始数组进行切片
            const slicedLogs = this.logs.slice(effectiveStart, effectiveEnd);

            if (filterUser) {
                return slicedLogs.filter(log => log.userId === filterUser);
            }
            return slicedLogs;
        },

        /**
         * @action 3: 清除所有日志数据 (修复 LogTerminal.vue 中的 bug)
         */
        clearAllLogs() {
            this.logs = [];
            this.totalCount = 0;
            this.lastLogId = 0;
            console.log('Log Store Cleared: All historical data removed.');
        },

        /**
         * @action 4: 模拟导出所有日志 (仅控制台输出)
         */
        exportAllLogs() {
            const logContent = this.logs
                .map(log => `${log.timestamp} [${log.level}] ${log.service} (${log.userId}): ${log.message}`)
                .join('\n');
            
            console.log(`Exporting ${this.logs.length} logs to a file (MOCK). Content snippet:\n---`);
            console.log(logContent.substring(0, 500) + '...');
        }
    }
});