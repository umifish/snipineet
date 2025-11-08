/**
 * LogReporter.ts
 * 核心日志上报类。由 LogSingleton 管理其单例生命周期。
 */

import {
  LogLevel,
  LogContext,
  LogScene,
  LogEntry,
  LogReporterConfig,
  SDKOptions,
  EnvUrlsConfig,
  EnvSpecificConfig,
} from "./LogTypes";
import { LogBuilder } from "./LogBuilder";
import { TimeSynchronizer } from "./TimeSynchronizer";
import { GLOBAL_KEY } from "./Constants";

// 简化跨环境定时器类型：在浏览器中是 number，在 Node.js 中是 NodeJS.Timeout
type GlobalTimer = number | NodeJS.Timeout;

// 新增重试批次类型定义
interface RetryBatch {
  logs: LogEntry[];
  url: string;
  type: string;
  retries: number;
  nextRetryTime: number; // 毫秒时间戳
}

// 增强 SDKOptions 类型以包含新的配置项
interface EnhancedSDKOptions extends SDKOptions {
  maxRetries: number;
  initialRetryDelay: number;
  maxQueueSize: number; // 队列容量硬性限制
  minLogLevel: LogLevel | "off"; // 最小日志上报等级
  syncInterval: number; // 新增：定时检测间隔 (ms)
}

// 增强 LogReporterConfig 结构以使用新的 Options
interface EnhancedLogReporterConfig extends LogReporterConfig {
  options: EnhancedSDKOptions;
}

export class LogReporter {
  public config: EnhancedLogReporterConfig & {
    context: LogContext;
    envUrls: EnvUrlsConfig;
    envConfig: EnvSpecificConfig;
  };
  private logQueue: LogEntry[] = [];
  private sendingQueue: LogEntry[] = [];
  private retryQueue: RetryBatch[] = [];
  private timer: GlobalTimer | null = null;
  private lastTimestamp: number = 0;
  private sequence: number = 0;
  private timeSync: TimeSynchronizer;

  private currentApiUrls!: Record<string, string>;
  private defaultApiUrl!: string;

  // TimeSynchronizer 失败处理：新增时间同步状态
  private isTimeSynced: boolean = false;

  // --- 辅助方法：配置、环境与 ID ---

  private _generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  private _getHostDisabledStatus(hosts: string[]): boolean {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return hosts.some((key) => host.includes(key));
  }

  private _getEnvironment(): string {
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
  }

  private _getDefaultConfig(isViteDev: boolean): EnhancedLogReporterConfig {
    const defaultDisabledHosts = [
      "localhost",
      "127.0.0.1",
      "test.",
      "qa.",
      "staging.",
    ];
    const hostDisabled = this._getHostDisabledStatus(defaultDisabledHosts);
    const env = this._getEnvironment();

    return {
      envUrls: {
        development: {
          default: "/api/dev/logs/all",
          error: "/api/dev/errors",
        },
        production: {
          default: "/api/prod/logs/all",
          error: "/api/prod/errors",
          monitor: "/api/prod/metrics",
        },
      },
      envConfig: {
        development: {
          ntpUrl: "/api/dev/ntp/time",
        },
        production: {
          ntpUrl: "https://prod.api.example.com/ntp/time",
        },
      },
      context: {
        clientId: this._generateUniqueId(),
        userId: null,
        serverName: "FrontendApp",
        env: env,
        pageUrl: typeof window !== "undefined" ? window.location.href : "N/A",
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
      } as LogContext,
      options: {
        maxLogs: 10,
        interval: 1000,
        separateByUrl: true,
        enableUnloadReport: true,
        autoSync: true,
        jitterThreshold: 500, // 抖动检测阈值 (500ms)
        syncInterval: 3600000, // 定时检测间隔 (1 小时)
        customHeaders: {},
        disabledHosts: defaultDisabledHosts,
        disabled: isViteDev || hostDisabled,

        maxRetries: 5,
        initialRetryDelay: 1000,

        maxQueueSize: 50000,

        minLogLevel: "debug",
      } as EnhancedSDKOptions,
    } as EnhancedLogReporterConfig;
  }

  constructor(config: Partial<LogReporterConfig> = {}) {
    let isViteDev = false;
    try {
      if (typeof import.meta !== "undefined" && import.meta.env) {
        isViteDev = import.meta.env.DEV;
      }
    } catch (e) {
      /* 安全跳过 */
    }

    const defaultConfig = this._getDefaultConfig(isViteDev);
    const mergedOptions = Object.assign(
      {},
      defaultConfig.options,
      config.options
    );
    const mergedContext = Object.assign(
      {},
      defaultConfig.context,
      config.context
    );
    const mergedEnvUrls = Object.assign(
      {},
      defaultConfig.envUrls,
      config.envUrls
    );
    const mergedEnvConfig = Object.assign(
      {},
      defaultConfig.envConfig,
      config.envConfig
    );

    // 确保 config 结构完整
    this.config = Object.assign({}, defaultConfig, config, {
      context: mergedContext as LogContext,
      options: mergedOptions as EnhancedSDKOptions,
      envUrls: mergedEnvUrls as EnvUrlsConfig,
      envConfig: mergedEnvConfig as EnvSpecificConfig,
    }) as EnhancedLogReporterConfig & {
      context: LogContext;
      envUrls: EnvUrlsConfig;
      envConfig: EnvSpecificConfig;
    };

    // 处理禁用逻辑
    if (config.options && config.options.disabled !== undefined) {
      this.config.options.disabled = config.options.disabled;
    } else {
      const hostCheckDisabled = this._getHostDisabledStatus(
        this.config.options.disabledHosts
      );
      this.config.options.disabled = isViteDev || hostCheckDisabled;
    }

    this._setCurrentUrls();

    const currentEnv = this.config.context.env;
    const currentNtpUrl = this.config.envConfig[currentEnv]?.ntpUrl || "";

    // 初始化 TimeSynchronizer，并传递新增的 syncInterval 和 jitterThreshold
    this.timeSync = new TimeSynchronizer({
      ntpUrl: currentNtpUrl,
      autoSync: this.config.options.autoSync,
      jitterThreshold: this.config.options.jitterThreshold,
      syncInterval: this.config.options.syncInterval, // <-- 新增的配置

      // TimeSynchronizer 增强：传入回调处理同步结果
      onSyncSuccess: () => {
        this.isTimeSynced = true;
      },
      onSyncFail: (error) => {
        this.isTimeSynced = false;
        // TimeSynchronizer 增强：记录失败日志
        this.error(
          new Error(`NTP time sync failed: ${error.message}`),
          { scene: { eventType: "TIME_SYNC_FAILURE" } },
          false
        );
      },
    });

    if (!currentNtpUrl && this.config.options.autoSync) {
      console.warn(
        `LogReporter: 当前环境 [${currentEnv}] 未配置 ntpUrl，自动时间同步已禁用。`
      );
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

  /**
   * 根据当前的 context.env 确定上报 API URL 集合。
   */
  private _setCurrentUrls(): void {
    const currentEnv = this.config.context.env;
    const envConfig = this.config.envUrls[currentEnv];

    if (envConfig) {
      this.currentApiUrls = envConfig;
      this.defaultApiUrl = envConfig.default || "/api/default/logs";
    } else {
      const fallbackEnvKey =
        Object.keys(this.config.envUrls)[0] || "development";
      this.currentApiUrls = this.config.envUrls[fallbackEnvKey] || {
        default: "/api/fallback/logs",
      };
      this.defaultApiUrl = this.currentApiUrls.default;
      console.warn(
        `LogReporter: 未找到环境 [${currentEnv}] 的 API 配置，退回到 [${fallbackEnvKey}]。`
      );
    }
  }

  // --- 公共 API：销毁与环境 ---
  public destroy(): void {
    this.stopIntervalReport();
    this.logQueue = [];
    this.sendingQueue = [];
    this.retryQueue = [];
    console.info("LogReporter 实例已销毁。");
  }

  public syncTime(): Promise<number> {
    return this.timeSync.syncTime();
  }

  public setEnvironment(newEnv: string): void {
    this.setContext("env", newEnv);
    this._setCurrentUrls(); // 重新设置 API URL 集合

    // 更新 TimeSynchronizer 的 URL
    const currentNtpUrl = this.config.envConfig[newEnv]?.ntpUrl || "";
    this.timeSync.setNtpUrl(currentNtpUrl);

    if (this.config.options.autoSync && currentNtpUrl) {
      this.timeSync.syncTime(); // 立即同步时间
    } else if (!currentNtpUrl) {
      console.warn(
        `LogReporter: 切换到环境 [${newEnv}] 未配置 ntpUrl，自动时间同步已禁用。`
      );
    }
  }

  public setContext(key: keyof LogContext | string, value: any): void {
    this.config.context[key] = value;
  }

  public setCustomHeader(key: string, value: string): void {
    this.config.options.customHeaders[key] = value;
  }

  // 跨环境类型声明优化：使用 GlobalTimer 类型
  public startIntervalReport(): void {
    if (this.timer) {
      // 使用 as any 兼容 Node.js/Browser
      clearInterval(this.timer as any);
    }

    // 赋值时使用 as GlobalTimer 确保类型兼容
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

  // --- 核心上报方法 (接收 LogBuilder 实例) ---
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

  // --- 公共 API：使用 LogBuilder 工厂重构 ---

  public log(
    payload: Record<string, any> & { level: LogLevel },
    type: string,
    scene: Partial<LogScene> = {},
    context: Partial<LogContext> = {},
    immediate: boolean = false
  ): void {
    if (this.config.options.disabled) return;

    const level = payload.level || ("info" as LogLevel);

    const builder = LogBuilder.log(type, level, payload, scene, context);

    this.reportObject(builder, immediate);
  }

  public error(
    logData: Error | Record<string, any> | string,
    context: Partial<LogContext> = {},
    immediate: boolean = true
  ): void {
    if (this.config.options.disabled) return;
    const errorPayload = this._normalizeError(logData);

    const builder = LogBuilder.error(
      "error",
      errorPayload,
      { source: "manual-code", eventType: "EXCEPTION" },
      context
    );

    this.reportObject(builder, immediate);
  }

  public warn(
    logData: Record<string, any> | string,
    context: Partial<LogContext> = {},
    immediate: boolean = false
  ): void {
    if (this.config.options.disabled) return;
    const payloadInfo = {
      info: typeof logData === "string" ? logData : JSON.stringify(logData),
      level: "warn",
    };

    const builder = LogBuilder.info(
      "info",
      payloadInfo,
      { source: "manual-code", eventType: "WARN" },
      context
    );

    this.reportObject(builder, immediate);
  }

  public info(
    logData: Record<string, any> | string,
    context: Partial<LogContext> = {},
    immediate: boolean = false
  ): void {
    if (this.config.options.disabled) return;
    const payloadInfo = {
      info: typeof logData === "string" ? logData : JSON.stringify(logData),
      level: "info",
    };

    const builder = LogBuilder.info(
      "info",
      payloadInfo,
      { source: "manual-code", eventType: "INFO" },
      context
    );

    this.reportObject(builder, immediate);
  }

  public debug(
    logData: Record<string, any> | string,
    context: Partial<LogContext> = {},
    immediate: boolean = false
  ): void {
    if (this.config.options.disabled) return;
    const payloadInfo = {
      info: typeof logData === "string" ? logData : JSON.stringify(logData),
      level: "debug",
    };

    const builder = LogBuilder.log(
      "debug",
      "debug",
      payloadInfo,
      { source: "manual-code", eventType: "DEBUG" },
      context
    );

    this.reportObject(builder, immediate);
  }

  public monitor(
    logData: Record<string, any>,
    context: Partial<LogContext> = {},
    immediate: boolean = false
  ): void {
    if (this.config.options.disabled) return;

    const builder = LogBuilder.monitor(
      "monitor",
      logData,
      { source: "manual-code", eventType: "METRIC" },
      context
    );

    this.reportObject(builder, immediate);
  }

  // --- 内部核心方法 ---

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

  private _log(
    payload: Record<string, any>,
    type: string,
    immediate: boolean,
    customContext: Partial<LogContext>,
    scene: Partial<LogScene>
  ): void {
    const level: LogLevel = payload.level || ("info" as LogLevel);

    // 日志过滤（运行时）：检查 minLogLevel
    const minLevelConfig = this.config.options.minLogLevel;
    if (
      minLevelConfig !== "off" &&
      this._getLogLevelValue(level) <
        this._getLogLevelValue(minLevelConfig as LogLevel)
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

      // TimeSynchronizer 增强：记录时间同步状态
      isTimeSynced: this.isTimeSynced,

      scene: {
        source: "manual-code",
        pagePath: (this.config.context.pageUrl || "").split("?")[0],
        eventType: level,
        ...scene,
      } as LogScene,

      // 合并 Context
      ...this.config.context,
      ...customContext,

      ...payload,
    } as LogEntry;

    // 内存/队列溢出保护：检查 maxQueueSize
    if (this.logQueue.length >= this.config.options.maxQueueSize) {
      // 丢弃最老的日志（FIFO 策略）
      this.logQueue.shift();
      // 强制记录一条丢弃日志的警告
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

  public async flush(): Promise<void> {
    if (this.config.options.disabled) return;
    if (this.sendingQueue.length > 0) return;
    if (this.logQueue.length === 0) return;

    const logsToSend = this.logQueue.splice(0, this.logQueue.length);
    this.sendingQueue = logsToSend;

    if (this.config.options.separateByUrl) {
      await this._flushGrouped(logsToSend);
    } else {
      await this._flushUnified(logsToSend);
    }

    this.sendingQueue = [];
  }

  // --- 重试逻辑相关方法 ---

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
      console.info(
        `LogReporter: 重新排队 ${logsToRetry.length} 条日志进行重试。`
      );
    }

    this.retryQueue = newRetryQueue;
  }

  private async sendLogs(
    logs: LogEntry[],
    url: string,
    type: string = "unknown"
  ): Promise<{ success: boolean; logs: LogEntry[]; url: string }> {
    if (typeof fetch === "undefined") {
      throw new Error(
        "fetch is not defined (likely running in a non-browser environment)."
      );
    }

    const mergedHeaders = {
      "Content-Type": "application/json",
      ...this.config.options.customHeaders,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: mergedHeaders,
      body: JSON.stringify({ data: logs }),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`LogReporter: [${type}] 上报成功，共 ${logs.length} 条。`);
    return { success: true, logs: logs, url: url };
  }

  private async _flushGrouped(logs: LogEntry[]): Promise<void> {
    const groupedLogs: Record<string, LogEntry[]> = logs.reduce((acc, log) => {
      const type = log.type || "info";
      if (!acc[type]) acc[type] = [];
      acc[type].push(log);
      return acc;
    }, {} as Record<string, LogEntry[]>);

    const sendPromises = Object.keys(groupedLogs).map((type) => {
      const logsByType = groupedLogs[type];
      const url = this.currentApiUrls[type] || this.defaultApiUrl;

      // 查找批次是否来自重试队列，并获取重试次数
      const retryInfo = this.retryQueue.find((b) => b.logs === logsByType);
      const retries = retryInfo ? retryInfo.retries : 0;

      if (url) {
        return this.sendLogs(logsByType, url, type).catch((error) => {
          // 在失败结果中传递重试次数
          return {
            success: false,
            logs: logsByType,
            url: url,
            error: error,
            retries: retries,
          };
        });
      }
      return {
        success: true,
        logs: logsByType,
        url: "N/A",
        error: null,
        retries: 0,
      };
    });

    const results = await Promise.all(sendPromises);
    this._handleFailedBatches(results);
  }

  private async _flushUnified(logs: LogEntry[]): Promise<void> {
    const url = this.defaultApiUrl;

    // 查找批次是否来自重试队列，并获取重试次数
    const retryInfo = this.retryQueue.find((b) => b.logs === logs);
    const retries = retryInfo ? retryInfo.retries : 0;

    if (url) {
      try {
        await this.sendLogs(logs, url, "unified");
      } catch (error) {
        // 在失败结果中传递重试次数
        this._handleFailedBatches([
          {
            success: false,
            logs: logs,
            url: url,
            error: error,
            retries: retries,
          },
        ]);
      }
    } else {
      console.warn(`LogReporter: 未配置 defaultUrl，日志已丢弃。`);
    }
  }

  private _handleFailedBatches(results: any[]): void {
    const maxRetries = this.config.options.maxRetries;
    const initialDelay = this.config.options.initialRetryDelay;

    results.forEach((result) => {
      if (result && result.success === false) {
        const { logs, url, type, retries = 0 } = result;

        if (retries >= maxRetries) {
          console.error(
            `LogReporter: 日志批次 [${type}] 达到最大重试次数 (${maxRetries})，已丢弃 ${logs.length} 条日志。`
          );
          return;
        }

        // 计算下一次重试的延迟时间 (指数退避)
        // 延迟 = 初始延迟 * 2^retries + 随机抖动 (0-100ms)
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
        console.warn(
          `LogReporter: 日志批次 [${type}] 失败，将在 ${Math.round(
            nextDelay
          )}ms 后重试 (第 ${newBatch.retries} 次)。`
        );
      }
    });
  }

  // --- 页面卸载处理 ---

  private _setupUnloadListener(): void {
    if (typeof window === "undefined") return;
    const handler = () => {
      this.stopIntervalReport();
      // 包含重试队列中的日志
      this._finalFlush([...this.logQueue, ...this._getLogsFromRetryQueue()]);
    };
    window.addEventListener("pagehide", handler, { once: true });
    window.addEventListener("beforeunload", handler, { once: true });
  }

  // 辅助函数：将重试队列中的所有日志提取出来
  private _getLogsFromRetryQueue(): LogEntry[] {
    return this.retryQueue.flatMap((batch) => batch.logs);
  }

  private _finalFlush(logs: LogEntry[]): void {
    if (this.config.options.disabled) return;

    const allLogs = [...logs, ...this.sendingQueue];
    if (allLogs.length === 0) return;

    const url = this.defaultApiUrl;
    if (!url || typeof navigator === "undefined") {
      return;
    }

    const payload = JSON.stringify({ data: allLogs });
    const blob = new Blob([payload], { type: "application/json" });

    if (navigator.sendBeacon) {
      if (Object.keys(this.config.options.customHeaders).length > 0) {
        console.warn("LogReporter: sendBeacon 不支持自定义请求头。");
      }
      navigator.sendBeacon(url, blob);
    } else {
      this._fallbackSyncSend(url, payload);
    }

    // 清空所有队列，因为这是最终发送
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
