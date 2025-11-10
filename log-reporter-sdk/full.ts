/**
 * LogReporter.ts - 完整集成文件
 * 包含 LogTypes, Constants, LogBuilder, TimeSynchronizer (v2 - 采样和中位数处理), 和 LogReporter (v2)。
 */

// ******************************************************
// ***** 1. LogTypes & Interfaces 定义 *****
// ******************************************************

export type LogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "monitor";

export interface LogContext {
  clientId: string | (() => string); // 允许函数或字符串
  userId: string | null;
  serverName: string;
  env: string;
  pageUrl: string;
  userAgent: string;
  [key: string]: any;
}

export interface LogScene {
  source: string;
  pagePath: string;
  eventType: string;
  [key: string]: any;
}

export interface LogEntry
  extends Omit<LogContext, "clientId">,
    Record<string, any> {
  clientId: string; // 运行时必须是 string
  type: string;
  timestamp: number;
  sequence: number;
  isoTime: string;
  level: LogLevel;
  isTimeSynced: boolean;
  scene: LogScene;
}

export interface SDKOptions {
  maxLogs: number;
  interval: number;
  enableUnloadReport: boolean;
  autoSync: boolean;
  customHeaders: Record<string, string>;
  disabledHosts: string[];
  disabled: boolean;
  [key: string]: any;
}

export interface LogReporterConfig {
  context: Partial<LogContext>;
  options: Partial<SDKOptions>;
}

// 增强 SDKOptions 类型 (包含 TimeSynchronizer 配置)
interface EnhancedSDKOptions extends SDKOptions {
  maxRetries: number;
  initialRetryDelay: number;
  maxQueueSize: number;
  minLogLevel: LogLevel | "off";
  separateByUrl: boolean;
  defaultApiUrl: string;
  monitorApiUrl?: string;
  ntpUrl?: string;
  jitterThreshold: number;
  syncInterval: number;
  shellTarget: string;
  shellResourceType: string | number;
  shellResourceId: string | number;
  sampleSize: number; // 采样次数
}

// 增强 LogReporterConfig 结构
interface EnhancedLogReporterConfig extends LogReporterConfig {
  options: EnhancedSDKOptions;
}

// Shell Type 定义
type ShellType = "monitor" | "log" | "error";

// 日志批次外部套壳结构 (Shell)
interface LogBatchShell {
  to: {
    target: string;
  };
  resourceType: string | number;
  resourceId: string | number;
  type: ShellType | "unified";
  data: LogEntry[];
}

// 新增重试批次类型定义
interface RetryBatch {
  logs: LogEntry[];
  url: string;
  type: ShellType | "unified";
  retries: number;
  nextRetryTime: number;
}

// ******************************************************
// ***** 2. Constants & Utilities & Default Config 定义 *****
// ******************************************************

export const GLOBAL_KEY = "__LogSDK__";
type GlobalTimer = number | NodeJS.Timeout;

// --- 辅助函数 ---

const _generateUniqueId = (): string =>
  Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
const _getEnvironment = (): string => {
  try {
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.DEV
    ) {
      return "development";
    }
  } catch (e) {
    /* 安全跳过 */
  }
  return "production";
};

const statistics = {
  /**
   * 计算数组的中位数。
   */
  median(arr: number[]): number {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  },
};

// --- 默认配置 ---

const DEFAULT_DISABLED_HOSTS = ["localhost", "test.", "qa.", "staging."];
const ENV = _getEnvironment();

const DEFAULT_CONTEXT: LogContext = {
  clientId: _generateUniqueId, // 默认使用函数，在运行时计算
  userId: null,
  serverName: "FrontendApp",
  env: ENV,
  pageUrl: typeof window !== "undefined" ? window.location.href : "N/A",
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
};

const DEFAULT_OPTIONS: EnhancedSDKOptions = {
  // 核心上报配置
  maxLogs: 10,
  interval: 1000,
  enableUnloadReport: true,
  defaultApiUrl: "/api/logs/default",
  monitorApiUrl: "/api/logs/monitor",
  separateByUrl: true,

  // 时钟同步配置
  autoSync: true, // 默认开启自动同步
  ntpUrl: "https://api.example.com/time/ntp",
  jitterThreshold: 500, // 500ms 阈值
  syncInterval: 3600000, // 1小时校准一次
  sampleSize: 5, // 5次采样

  // 结构配置
  shellTarget: "global",
  shellResourceType: "frontend",
  shellResourceId: "app-main-01",

  // 队列/重试配置
  maxRetries: 5,
  initialRetryDelay: 1000,
  maxQueueSize: 50000,

  // 过滤/禁用配置
  minLogLevel: "debug",
  customHeaders: {},
  disabledHosts: DEFAULT_DISABLED_HOSTS,
  disabled: false,
};

export const DEFAULT_LOG_REPORTER_CONFIG: EnhancedLogReporterConfig = {
  context: DEFAULT_CONTEXT,
  options: DEFAULT_OPTIONS,
};

// ******************************************************
// ***** 3. LogBuilder 定义 *****
// ******************************************************

export class LogBuilder {
  private type: string;
  private payload: Record<string, any>;
  private scene: Partial<LogScene>;
  private context: Partial<LogContext>;

  constructor(
    type: string,
    payload: Record<string, any>,
    scene: Partial<LogScene>,
    context: Partial<LogContext>
  ) {
    this.type = type;
    this.payload = payload;
    this.scene = scene;
    this.context = context;
  }

  getPayload(): Record<string, any> {
    return this.payload;
  }
  getType(): string {
    return this.type;
  }
  getScene(): Partial<LogScene> {
    return this.scene;
  }
  getContext(): Partial<LogContext> {
    return this.context;
  }

  static log(
    type: string,
    level: LogLevel,
    payload: Record<string, any>,
    scene: Partial<LogScene> = {},
    context: Partial<LogContext> = {}
  ) {
    return new LogBuilder(type, { ...payload, level }, scene, context);
  }
  static error(
    type: string,
    payload: Record<string, any>,
    scene: Partial<LogScene> = {},
    context: Partial<LogContext> = {}
  ) {
    return this.log(type, "error", payload, scene, context);
  }
  static info(
    type: string,
    payload: Record<string, any>,
    scene: Partial<LogScene> = {},
    context: Partial<LogContext> = {}
  ) {
    return this.log(type, "info", payload, scene, context);
  }
  static monitor(
    type: string,
    payload: Record<string, any>,
    scene: Partial<LogScene> = {},
    context: Partial<LogContext> = {}
  ) {
    return this.log(type, "monitor", payload, scene, context);
  }
  static debug(
    type: string,
    payload: Record<string, any>,
    scene: Partial<LogScene> = {},
    context: Partial<LogContext> = {}
  ) {
    return this.log(type, "debug", payload, scene, context);
  }
}

// ******************************************************
// ***** 4. TimeSynchronizer 定义 (增强版) *****
// ******************************************************

export interface TimeSyncConfig {
  ntpUrl: string;
  autoSync: boolean;
  jitterThreshold: number;
  syncInterval: number;
  sampleSize: number;
  onSyncSuccess?: () => void;
  onSyncFail?: (error: Error) => void;
}

export class TimeSynchronizer {
  private config: TimeSyncConfig;
  private timeOffset: number = 0;
  private isSyncing: boolean = false;
  private timer: GlobalTimer | null = null;
  private lastSuccessfulSync: number = 0;

  constructor(config: TimeSyncConfig) {
    this.config = config;

    if (!this.config.ntpUrl) {
      this.config.autoSync = false;
    }

    // 无论 autoSync 是否为 true，都需要在初始化时执行一次 timeSync，否则 this.timeOffset 永远是 0
    if (this.config.autoSync) {
      this._startAutoSync();
    } else if (this.config.ntpUrl) {
      // 如果禁用自动同步，也要立即执行一次同步，以校准初始时间
      this.syncTime();
    }
  }

  private async _syncTimeSample(): Promise<number> {
    if (!this.config.ntpUrl) {
      throw new Error("NTP URL 未配置");
    }

    const t1 = Date.now();
    const response = await fetch(this.config.ntpUrl, {
      method: "GET",
      keepalive: false,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const t4 = Date.now();

    // 假设服务器时间字段为 'serverTime'
    const serverTime = data.serverTime;

    if (typeof serverTime !== "number") {
      throw new Error("服务器返回数据格式错误，未找到 serverTime 字段。");
    }

    const rtt = t4 - t1;
    const estimatedServerResponseTime = t1 + rtt / 2;
    const offset = serverTime - estimatedServerResponseTime;

    return offset;
  }

  public async syncTime(): Promise<number> {
    if (this.isSyncing) {
      return this.timeOffset;
    }

    if (!this.config.ntpUrl) {
      this._handleSyncFail(new Error("NTP URL 未配置"));
      return this.timeOffset;
    }

    this.isSyncing = true;
    const offsetSamples: number[] = [];

    try {
      for (let i = 0; i < this.config.sampleSize; i++) {
        try {
          const sample = await this._syncTimeSample();
          offsetSamples.push(sample);
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (e) {
          // 忽略单个采样失败
        }
      }

      if (offsetSamples.length === 0) {
        throw new Error("所有采样均失败，无法进行时间校准。");
      }

      const medianOffset = statistics.median(offsetSamples);
      const oldOffset = this.timeOffset;
      const drift = Math.abs(medianOffset - oldOffset);

      if (drift >= this.config.jitterThreshold) {
        this.timeOffset = medianOffset;
        this.config.onSyncSuccess?.();
      }

      this.lastSuccessfulSync = Date.now();
      return this.timeOffset;
    } catch (error) {
      this._handleSyncFail(error as Error);
      return this.timeOffset;
    } finally {
      this.isSyncing = false;
    }
  }

  public getSyncedTimestamp(rawLocalTimestamp: number): number {
    return rawLocalTimestamp + this.timeOffset;
  }

  public getCurrentOffset(): number {
    return this.timeOffset;
  }

  private _startAutoSync(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
    }

    if (this.config.syncInterval <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      this.syncTime();
    }, this.config.syncInterval) as GlobalTimer;

    // 启动时立即同步一次
    this.syncTime();
  }

  private _handleSyncFail(error: Error): void {
    this.config.onSyncFail?.(error);
  }

  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
      this.timer = null;
    }
    this.isSyncing = false;
  }
}

// ******************************************************
// ***** 5. LogReporter 定义 (主文件) *****
// ******************************************************

export class LogReporter {
  public config: EnhancedLogReporterConfig & {
    context: Omit<LogContext, "clientId"> & { clientId: string };
  };
  private logQueue: LogEntry[] = [];
  private sendingQueue: LogEntry[] = [];
  private retryQueue: RetryBatch[] = [];
  private timer: GlobalTimer | null = null;
  private lastTimestamp: number = 0;
  private sequence: number = 0;
  private timeSync: TimeSynchronizer;
  private isTimeSynced: boolean = false;

  // --- 内部配置和辅助方法 ---

  private _getHostDisabledStatus(hosts: string[]): boolean {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    if (hosts.length === 0) return false;
    return hosts.some((key) => host.includes(key));
  }

  private _normalizeError(logData: Error | Record<string, any> | string): {
    info: string | null;
    moreInfo: string | null;
    level: "error";
  } {
    if (logData instanceof Error) {
      return {
        info: logData.message || "Unknown Error",
        moreInfo: logData.stack || "No stack trace available",
        level: "error",
      };
    }
    if (typeof logData === "string") {
      return { info: logData, moreInfo: null, level: "error" };
    }

    return {
      info: logData.info || logData.message || "Custom Error",
      moreInfo: JSON.stringify(logData),
      level: "error",
    };
  }

  private _getLogLevelValue(level: LogLevel): number {
    const levels: Record<LogLevel, number> = {
      debug: 10,
      info: 20,
      warn: 30,
      error: 40,
      fatal: 50,
      monitor: 60,
    };
    return levels[level] || 0;
  }

  // --- 构造函数 ---

  constructor(config: Partial<LogReporterConfig> = {}) {
    const defaultConfig = DEFAULT_LOG_REPORTER_CONFIG;
    const mergedOptions = Object.assign(
      {},
      defaultConfig.options,
      config.options
    );
    const mergedContextRaw = Object.assign(
      {},
      defaultConfig.context,
      config.context
    );

    // 处理 clientId 的函数调用
    let finalClientId: string;
    const rawClientId = mergedContextRaw.clientId;

    if (typeof rawClientId === "function") {
      try {
        finalClientId = rawClientId();
      } catch (e) {
        finalClientId = _generateUniqueId();
      }
    } else {
      finalClientId = rawClientId as string;
    }

    const mergedContext = {
      ...(mergedContextRaw as Omit<LogContext, "clientId">),
      clientId: finalClientId,
    };

    this.config = Object.assign({}, defaultConfig, config, {
      context: mergedContext,
      options: mergedOptions as EnhancedSDKOptions,
    }) as EnhancedLogReporterConfig & {
      context: Omit<LogContext, "clientId"> & { clientId: string };
    };

    // 禁用的优先级判断
    if (!this.config.options.defaultApiUrl) {
      this.config.options.disabled = true;
    }

    if (config.options?.disabled === undefined) {
      const hostCheckDisabled = this._getHostDisabledStatus(
        this.config.options.disabledHosts
      );
      this.config.options.disabled = hostCheckDisabled;
    } // 否则，使用用户配置的 disabled 值

    const currentNtpUrl = this.config.options.ntpUrl || "";

    // 初始化 TimeSynchronizer
    this.timeSync = new TimeSynchronizer({
      ntpUrl: currentNtpUrl,
      autoSync: this.config.options.autoSync,
      jitterThreshold: this.config.options.jitterThreshold,
      syncInterval: this.config.options.syncInterval,
      sampleSize: this.config.options.sampleSize,

      onSyncSuccess: () => {
        this.isTimeSynced = true;
      },
      onSyncFail: (error: Error) => {
        this.isTimeSynced = false;
        this.error(
          new Error(`NTP time sync failed: ${error.message}`),
          { scene: { eventType: "TIME_SYNC_FAILURE" } },
          false
        );
      },
    });

    if (!currentNtpUrl && this.config.options.autoSync) {
      console.warn(`LogReporter: 未配置 ntpUrl，自动时间同步已禁用。`);
    }

    if (this.config.options.disabled) {
      console.warn("LogReporter: SDK 已禁用日志上报。");
      return;
    }

    if (
      this.config.options.enableUnloadReport &&
      typeof window !== "undefined"
    ) {
      this._setupUnloadListener();
    }
    this.startIntervalReport();
  }

  // --- 公共 API ---

  public destroy(): void {
    this.stopIntervalReport();
    this.logQueue = [];
    this.sendingQueue = [];
    this.retryQueue = [];
    this.timeSync.destroy();
  }

  public syncTime(): Promise<number> {
    return this.timeSync.syncTime();
  }

  public setEnvironment(newEnv: string): void {
    this.setContext("env", newEnv);
  }

  public setContext(
    key: Exclude<keyof LogContext, "clientId"> | string,
    value: any
  ): void {
    // clientId 只能通过构造函数或初始化函数设置，运行时不建议修改
    if (key === "clientId") {
      console.warn(
        "LogReporter: 运行时不建议修改 clientId，请在构造函数中设置。"
      );
      return;
    }
    this.config.context[key] = value;
  }

  public setCustomHeader(key: string, value: string): void {
    this.config.options.customHeaders[key] = value;
  }

  public startIntervalReport(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
    }
    this.timer = setInterval(() => {
      this._checkRetryQueue();

      if (this.logQueue.length > 0) {
        this.forceFlush();
      }
    }, this.config.options.interval) as GlobalTimer;
  }

  public stopIntervalReport(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
      this.timer = null;
    }
  }

  public forceFlush(): void {
    if (this.logQueue.length > 0) {
      this.flush();
    }
  }

  public reportObject(
    logBuilder: LogBuilder,
    immediate: boolean = false
  ): void {
    if (this.config.options.disabled) return;

    const payload = logBuilder.getPayload() as Record<string, any> & {
      level: LogLevel;
    };
    const type = logBuilder.getType();
    const scene = logBuilder.getScene();
    const context = logBuilder.getContext();

    this._log(payload, type, immediate, context, scene);
  }

  // --- 简易 API ---
  public log(
    type: string,
    message: string,
    detail: Record<string, any> = {},
    immediate: boolean = false,
    context: Partial<LogContext> = {},
    scene: Partial<LogScene> = {}
  ): void {
    this.reportObject(
      LogBuilder.log(type, "info", { message, ...detail }, scene, context),
      immediate
    );
  }

  public error(
    error: Error | string | Record<string, any>,
    detail: Record<string, any> = {},
    immediate: boolean = true,
    context: Partial<LogContext> = {},
    scene: Partial<LogScene> = {}
  ): void {
    const normalized = this._normalizeError(error);
    this.reportObject(
      LogBuilder.error(
        "error_report",
        { message: normalized.info, detail: normalized.moreInfo, ...detail },
        scene,
        context
      ),
      immediate
    );
  }

  public warn(
    type: string,
    message: string,
    detail: Record<string, any> = {},
    immediate: boolean = false,
    context: Partial<LogContext> = {},
    scene: Partial<LogScene> = {}
  ): void {
    this.reportObject(
      LogBuilder.log(type, "warn", { message, ...detail }, scene, context),
      immediate
    );
  }

  public info(
    type: string,
    message: string,
    detail: Record<string, any> = {},
    immediate: boolean = false,
    context: Partial<LogContext> = {},
    scene: Partial<LogScene> = {}
  ): void {
    this.reportObject(
      LogBuilder.log(type, "info", { message, ...detail }, scene, context),
      immediate
    );
  }

  public debug(
    type: string,
    message: string,
    detail: Record<string, any> = {},
    immediate: boolean = false,
    context: Partial<LogContext> = {},
    scene: Partial<LogScene> = {}
  ): void {
    this.reportObject(
      LogBuilder.log(type, "debug", { message, ...detail }, scene, context),
      immediate
    );
  }

  public monitor(
    type: string,
    detail: Record<string, any> = {},
    immediate: boolean = false,
    context: Partial<LogContext> = {},
    scene: Partial<LogScene> = {}
  ): void {
    this.reportObject(
      LogBuilder.monitor(type, detail, scene, context),
      immediate
    );
  }

  // --- 核心上报逻辑 ---

  private _log(
    payload: Record<string, any>,
    type: string,
    immediate: boolean,
    customContext: Partial<LogContext>,
    scene: Partial<LogScene>
  ): void {
    const level: LogLevel = payload.level || ("info" as LogLevel);

    if (
      this.config.options.minLogLevel !== "off" &&
      this._getLogLevelValue(level) <
        this._getLogLevelValue(this.config.options.minLogLevel as LogLevel)
    ) {
      return;
    }

    const { timestamp, sequence } = this._generateTimestamp();

    const logEntry: LogEntry = {
      type: type,
      timestamp: timestamp,
      sequence: sequence,
      isoTime: new Date(timestamp).toISOString(),
      level: level,
      isTimeSynced: this.isTimeSynced,

      scene: {
        source: "manual-code",
        pagePath: (this.config.context.pageUrl || "").split("?")[0],
        eventType: level,
        ...scene,
      } as LogScene,

      ...this.config.context,
      ...(customContext as Omit<LogContext, "clientId"> & {
        [key: string]: any;
      }), // 合并 customContext，但 clientId 在初始化时已确定

      ...payload,
    } as LogEntry;

    if (this.logQueue.length >= this.config.options.maxQueueSize) {
      this.logQueue.shift();
      console.warn(
        `LogReporter: 主队列已满 (${this.config.options.maxQueueSize})，已丢弃最老的日志。`
      );
    }

    this.logQueue.push(logEntry);

    if (immediate || this.logQueue.length >= this.config.options.maxLogs) {
      this.forceFlush();
    }
  }

  private _generateTimestamp(): { timestamp: number; sequence: number } {
    const rawLocalTimestamp = Date.now();
    const currentTimestamp =
      this.timeSync.getSyncedTimestamp(rawLocalTimestamp);

    if (currentTimestamp === this.lastTimestamp) {
      this.sequence += 1;
    } else {
      this.lastTimestamp = currentTimestamp;
      this.sequence = 0;
    }
    return { timestamp: currentTimestamp, sequence: this.sequence };
  }

  private _getShellType(logs: LogEntry[]): ShellType {
    if (logs.some((l) => l.level === "error" || l.level === "fatal")) {
      return "error";
    }
    if (logs.some((l) => l.level === "monitor")) {
      return "monitor";
    }
    return "log";
  }

  private _getShellApiUrl(shellType: ShellType): string | undefined {
    const options = this.config.options;
    switch (shellType) {
      case "monitor":
        return options.monitorApiUrl;
      case "error":
      case "log":
      default:
        return options.defaultApiUrl;
    }
  }

  // --- 冲刷与网络逻辑 ---

  public async flush(): Promise<void> {
    if (this.config.options.disabled) return;
    if (this.sendingQueue.length > 0) return;
    if (this.logQueue.length === 0) return;

    const logsToSend = this.logQueue.splice(0, this.logQueue.length);
    this.sendingQueue = logsToSend;

    if (this.config.options.separateByUrl) {
      await this._flushGroupedByShellType(logsToSend);
    } else {
      await this._flushUnified(logsToSend);
    }

    this.sendingQueue = [];
  }

  private _checkRetryQueue(): void {
    const now = Date.now();
    const logsToRetry: LogEntry[] = [];
    const newRetryQueue: RetryBatch[] = [];

    this.retryQueue.forEach((batch) => {
      if (batch.nextRetryTime <= now) {
        logsToRetry.push(...batch.logs);
      } else {
        newRetryQueue.push(batch);
      }
    });

    if (logsToRetry.length > 0) {
      this.logQueue.unshift(...logsToRetry);
    }

    this.retryQueue = newRetryQueue;
  }

  private async sendLogs(
    logs: LogEntry[],
    url: string,
    shellType: ShellType | "unified"
  ): Promise<{
    success: boolean;
    logs: LogEntry[];
    url: string;
    type: ShellType | "unified";
  }> {
    if (typeof fetch === "undefined") {
      throw new Error("fetch is not defined.");
    }

    const mergedHeaders = {
      "Content-Type": "application/json",
      ...this.config.options.customHeaders,
    };

    const payloadShell: LogBatchShell = {
      to: { target: this.config.options.shellTarget },
      resourceType: this.config.options.shellResourceType,
      resourceId: this.config.options.shellResourceId,
      type: shellType,
      data: logs,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: mergedHeaders,
      body: JSON.stringify(payloadShell),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return { success: true, logs: logs, url: url, type: shellType };
  }

  private async _flushGroupedByShellType(logs: LogEntry[]): Promise<void> {
    const groupedByLevel: Record<LogLevel, LogEntry[]> = logs.reduce(
      (acc, log) => {
        const level = log.level || "info";
        if (!acc[level]) acc[level] = [];
        acc[level].push(log);
        return acc;
      },
      {} as Record<LogLevel, LogEntry[]>
    );

    const batches: { logs: LogEntry[]; shellType: ShellType }[] = [];

    if (groupedByLevel.monitor && groupedByLevel.monitor.length > 0) {
      batches.push({ logs: groupedByLevel.monitor, shellType: "monitor" });
      delete groupedByLevel.monitor;
    }

    const errorLogs = [
      ...(groupedByLevel.error || []),
      ...(groupedByLevel.fatal || []),
    ];
    if (errorLogs.length > 0) {
      batches.push({ logs: errorLogs, shellType: "error" });
      delete groupedByLevel.error;
      delete groupedByLevel.fatal;
    }

    const logLogs = Object.values(groupedByLevel).flat();
    if (logLogs.length > 0) {
      batches.push({ logs: logLogs, shellType: "log" });
    }

    const sendPromises = batches.map((batch) => {
      const url = this._getShellApiUrl(batch.shellType);
      const retries =
        this.retryQueue.find((b) => b.logs === batch.logs)?.retries || 0;

      if (url) {
        return this.sendLogs(batch.logs, url, batch.shellType).catch(
          (error) => {
            return {
              success: false,
              logs: batch.logs,
              url: url,
              error: error,
              retries: retries,
              type: batch.shellType,
            };
          }
        );
      }
      return {
        success: true,
        logs: batch.logs,
        url: "N/A",
        error: null,
        retries: 0,
        type: batch.shellType,
      };
    });

    const results = await Promise.all(sendPromises);
    this._handleFailedBatches(results);
  }

  private async _flushUnified(logs: LogEntry[]): Promise<void> {
    const url = this.config.options.defaultApiUrl;
    const batchType: ShellType | "unified" = "unified";

    const retryInfo = this.retryQueue.find((b) => b.logs === logs);
    const retries = retryInfo ? retryInfo.retries : 0;

    if (url) {
      try {
        await this.sendLogs(logs, url, batchType);
      } catch (error) {
        this._handleFailedBatches([
          {
            success: false,
            logs: logs,
            url: url,
            error: error,
            retries: retries,
            type: batchType,
          },
        ]);
      }
    }
  }

  private _handleFailedBatches(results: any[]): void {
    const maxRetries = this.config.options.maxRetries;
    const initialDelay = this.config.options.initialRetryDelay;

    results.forEach((result) => {
      if (result && result.success === false) {
        const { logs, url, type, retries = 0 } = result;

        if (retries >= maxRetries) {
          return;
        }

        const nextDelay =
          initialDelay * Math.pow(2, retries) + Math.random() * 100;
        const nextRetryTime = Date.now() + nextDelay;

        const newBatch: RetryBatch = {
          logs: logs,
          url: url,
          type: type,
          retries: retries + 1,
          nextRetryTime: nextRetryTime,
        };

        this.retryQueue.push(newBatch);
      }
    });
  }

  private _setupUnloadListener(): void {
    if (typeof window === "undefined") return;
    const handler = () => {
      this.stopIntervalReport();
      this._finalFlush([...this.logQueue, ...this._getLogsFromRetryQueue()]);
    };
    window.addEventListener("pagehide", handler, { once: true });
    window.addEventListener("beforeunload", handler, { once: true });
  }

  private _getLogsFromRetryQueue(): LogEntry[] {
    return this.retryQueue.flatMap((batch) => batch.logs);
  }

  private _finalFlush(logs: LogEntry[]): void {
    if (this.config.options.disabled) return;

    const allLogs = [...logs, ...this.sendingQueue];
    if (allLogs.length === 0) return;

    const url = this.config.options.defaultApiUrl;
    if (!url || typeof navigator === "undefined") {
      return;
    }

    const shellType: ShellType | "unified" = "unified";

    const payloadShell: LogBatchShell = {
      to: { target: this.config.options.shellTarget },
      resourceType: this.config.options.shellResourceType,
      resourceId: this.config.options.shellResourceId,
      type: shellType,
      data: allLogs,
    };

    const payload = JSON.stringify(payloadShell);
    const blob = new Blob([payload], { type: "application/json" });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      this._fallbackSyncSend(url, payload);
    }

    this.logQueue = [];
    this.sendingQueue = [];
    this.retryQueue = [];
  }

  private _fallbackSyncSend(url: string, payload: string): void {
    if (typeof XMLHttpRequest === "undefined") return;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, false); // 同步请求
      xhr.setRequestHeader("Content-Type", "application/json");
      for (const [key, value] of Object.entries(
        this.config.options.customHeaders
      )) {
        xhr.setRequestHeader(key, value);
      }
      xhr.send(payload);
    } catch (e) {
      console.error("LogReporter: 同步 XHR 最终上报失败。", e);
    }
  }
}
