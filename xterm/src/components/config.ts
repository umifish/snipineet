








// ========== 缓存配置 ==========
/** 最大缓存日志数量 */
export const MAX_CACHE_SIZE = 10000;

// ========== 轮询配置 ==========
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

// ========== 历史加载配置 ==========
/** 历史查询每次获取的日志数量限制 */
export const HISTORY_LIMIT = 100;

/** 历史查询的时间步长（毫秒） */
export const HISTORY_TIME_STEP = 3600000; // 1小时

// ========== 哨兵机制配置 ==========
/** 哨兵轮询间隔：每 N 次主轮询执行一次哨兵轮询 */
export const SENTINEL_POLL_INTERVAL = 3;

/** 哨兵每次查询的日志数量限制 */
export const SENTINEL_QUERY_LIMIT = 200;

/** 哨兵检查的时间窗口（毫秒），只检查最近时间窗口内的延迟日志 */
export const SENTINEL_TIME_WINDOW = 3600000; // 1小时

/** 哨兵冷却间隔：完成一轮检查后，等待 N 次主轮询再重新启动 */
export const SENTINEL_COOLDOWN_INTERVAL = 6;

/** 哨兵每次查询的时间步长（毫秒），每次往前检查的时间范围 */
export const SENTINEL_TIME_STEP = 300000; // 5分钟

// ========== 终端配置 ==========
/** 终端显示的日志数量（Xterm scrollback） */
export const TERMINAL_SIZE = 2000;

/** 滚动阈值（行数），用于判断是否滚动到底部 */
export const SCROLL_THRESHOLD = 3;

// ========== 模拟数据配置 ==========
/** 模拟的总历史日志条数 */
export const MAX_MOCK_HISTORY_SIZE = 50000;

/** 模拟用户列表 */
export const MOCK_USERS = ["admin", "userA", "userB", null];

/** 模拟服务列表 */
export const MOCK_SERVICES = ["AuthService", "DataProcessor", "Gateway", "Analytics"];

/** 模拟组列表 */
export const MOCK_GROUPS = ["A100", "B200", "C300"];

/** 模拟客户端列表 */
export const MOCK_CLIENTS = ["ClientX", "ClientY", "ClientZ"];

// ========== 用户配置 ==========
/** 当前用户（用于"只看我的"过滤） */
export const CURRENT_USER = "admin";

