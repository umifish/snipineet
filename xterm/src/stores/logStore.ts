// src/stores/logStore.ts
import { defineStore } from 'pinia';

// 定义日志对象的结构
export interface LogItem {
  id: number;
  userId: string;       // 用于过滤
  formattedMsg: string; // 用于显示（带颜色的字符串）
}

// ANSI 颜色定义 (与 Xterm 主题配置保持一致，以获得最佳视觉效果)
const COLORS = {
  RESET: '\x1b[0m',
  GRAY: '\x1b[90m',    // brightBlack
  RED: '\x1b[31m',     // red
  GREEN: '\x1b[32m',   // green
  YELLOW: '\x1b[33m',  // yellow
  MAGENTA: '\x1b[35m', // magenta
  CYAN: '\x1b[36m',    // cyan
};

// 模拟数据池
const USERS = ['admin', 'system-cron', 'jane_doe', 'guest'];
const SERVICES = ['Auth-Core', 'Payment-GW', 'Order-DB', 'User-Center'];

const mockFetchLogs = async (): Promise<LogItem[]> => {
  return new Promise((resolve) => {
    // 模拟每次拉取 1-3 条日志
    setTimeout(() => {
      const count = Math.floor(Math.random() * 3) + 1;
      const newItems: LogItem[] = [];
      
      for (let i = 0; i < count; i++) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB') + '.' + String(now.getMilliseconds()).padStart(3, '0');
        const id = Date.now() + i + Math.random();
        
        const rawService = SERVICES[Math.floor(Math.random() * SERVICES.length)];
        const rawUser = USERS[Math.floor(Math.random() * USERS.length)];

        // 格式化和对齐
        const serviceStr = `[${rawService}]`.padEnd(14, ' ');
        const userStr = `<${rawUser}>`.padEnd(14, ' ');

        const rand = Math.random();
        let level = `${COLORS.GREEN}[INFO] ${COLORS.RESET}`;
        let msgColor = COLORS.RESET;
        let msgText = `Request processed successfully.`;

        if (rand > 0.9) {
          level = `${COLORS.RED}[ERROR]${COLORS.RESET}`;
          msgColor = COLORS.RED;
          msgText = `Database connection failed or resource unavailable.`;
        } else if (rand > 0.7) {
          level = `${COLORS.YELLOW}[WARN] ${COLORS.RESET}`;
          msgText = `Slow query detected (execution time > 500ms).`;
        }

        // 使用 ANSI 颜色进行格式化
        const formattedMsg = 
          `${COLORS.GRAY}${timeStr}${COLORS.RESET} ` +
          `${COLORS.MAGENTA}${serviceStr}${COLORS.RESET} ` +
          `${COLORS.CYAN}${userStr}${COLORS.RESET} ` +
          `${level} ` +
          `${msgColor}${msgText}${COLORS.RESET}`;

        newItems.push({
          id,
          userId: rawUser,
          formattedMsg
        });
      }
      resolve(newItems);
    }, 200);
  });
};

export const useLogStore = defineStore('log', {
  state: () => ({
    fullLogCache: [] as LogItem[], // 存储结构化对象
  }),

  getters: {
    totalCount: (state) => state.fullLogCache.length,
  },

  actions: {
    async pullAndProcessLogs(): Promise<LogItem[]> {
      const newItems = await mockFetchLogs();
      if (newItems.length === 0) return [];

      this.fullLogCache.push(...newItems);

      // 维护 10000 条上限（移除最旧的）
      const MAX_CACHE = 10000;
      if (this.fullLogCache.length > MAX_CACHE) {
        // 移除最旧的部分
        this.fullLogCache = this.fullLogCache.slice(this.fullLogCache.length - MAX_CACHE);
      }

      return newItems;
    },

    /**
     * 获取指定窗口的日志切片，可选择是否过滤
     */
    getLogSlice(startIndex: number, size: number, filterUserId: string | null): LogItem[] {
      const start = Math.max(0, startIndex);
      const end = Math.min(start + size, this.fullLogCache.length);
      
      const slice = this.fullLogCache.slice(start, end);
      
      if (filterUserId) {
        return slice.filter(item => item.userId === filterUserId);
      }
      return slice;
    },

    exportAllLogs() {
      if (this.fullLogCache.length === 0) return;
      // 导出时移除 ANSI 颜色码，以便文件更干净
      const cleanContent = this.fullLogCache.map(i => i.formattedMsg.replace(/\x1b\[[0-9;]*m/g, '')).join('\n'); 
      const blob = new Blob([cleanContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `service_logs_${Date.now()}.log`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }
});