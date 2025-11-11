// TimeSynchronizer.ts

// 假设这些类型和接口在 './LogTypes' 文件中已定义
import { TimeSyncConfig, GlobalTimer } from "./LogTypes";

// ******************************************************
// ***** 1. 内部辅助工具 (Statistics) *****
// ******************************************************

const statistics = {
  /**
   * 计算数组的中位数 (Median)。用于消除 NTP 采集中网络抖动带来的离群值。
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

// ******************************************************
// ***** 2. TimeSynchronizer 类定义 *****
// ******************************************************

export class TimeSynchronizer {
  private config: TimeSyncConfig;
  private timeOffset: number = 0;
  private isSyncing: boolean = false;
  private timer: GlobalTimer | null = null;
  private lastSuccessfulSync: number = 0;

  // --- 动态间隔属性 ---
  private currentSyncInterval: number;
  // 失败重试间隔：5 分钟 (300,000ms)，用于网络波动时的快速恢复
  private readonly RETRY_SYNC_INTERVAL: number = 300000;

  // --- 漂移率计算属性 ---
  private lastOffset: number = 0; // 上次校准成功的 timeOffset 值
  private lastSyncLocalTime: number = 0; // 上次校准成功时的本地时间 (Date.now())
  private driftRatePPM: number = 0; // 累计漂移率 (Parts Per Million, ppm)

  constructor(config: TimeSyncConfig) {
    this.config = config;
    this.currentSyncInterval = config.syncInterval;

    if (!this.config.ntpUrl) {
      this.config.autoSync = false;
    }

    if (this.config.autoSync) {
      this._startAutoSync();
    } else if (this.config.ntpUrl) {
      // 立即执行一次初始校准
      this.syncTime();
    }
  }

  /**
   * 执行单次 NTP 采样并计算偏移量。
   */
  private async _syncTimeSample(): Promise<number> {
    if (!this.config.ntpUrl) {
      throw new Error("NTP URL 未配置");
    }

    const t1 = Date.now(); // 客户端发送请求前的时间
    const response = await fetch(this.config.ntpUrl, {
      method: "GET",
      keepalive: false,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const t4 = Date.now(); // 客户端接收响应后的时间

    // 假设服务器时间字段为 'serverTime'
    const serverTime = data.serverTime;

    if (typeof serverTime !== "number") {
      throw new Error("服务器返回数据格式错误，未找到 serverTime 字段。");
    }

    const rtt = t4 - t1;
    // 估计服务器处理和传输时间（假设是对称延迟）
    const estimatedServerResponseTime = t1 + rtt / 2;
    // 计算时钟偏移量 (Offset = T_server - T_estimated_local)
    const offset = serverTime - estimatedServerResponseTime;

    return offset;
  }

  /**
   * 计算时钟的平均漂移率（ppm）。
   */
  private _calculateDriftRate(currentOffset: number): void {
    const currentLocalTime = Date.now();

    if (this.lastSyncLocalTime > 0) {
      const timeElapsedMs = currentLocalTime - this.lastSyncLocalTime; // ΔT_local
      const offsetChange = currentOffset - this.lastOffset; // ΔOffset

      // 漂移率公式：(ΔOffset / ΔT_local) * 1,000,000
      if (timeElapsedMs > 0) {
        this.driftRatePPM = (offsetChange / timeElapsedMs) * 1_000_000;
      } else {
        this.driftRatePPM = 0;
      }
    }

    // 更新历史数据
    this.lastOffset = currentOffset;
    this.lastSyncLocalTime = currentLocalTime;
  }

  /**
   * 启动时钟同步过程，进行多次采样和中位数计算。
   * 处理成功/失败时的定时器间隔动态调整。
   */
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
      // 1. 多次采样
      for (let i = 0; i < this.config.sampleSize; i++) {
        try {
          const sample = await this._syncTimeSample();
          offsetSamples.push(sample);
          await new Promise((resolve) => setTimeout(resolve, 50)); // 采样间隔
        } catch (e) {
          // 忽略单个采样失败，继续下一个
        }
      }

      if (offsetSamples.length === 0) {
        throw new Error("所有采样均失败，无法进行时间校准。");
      }

      // 2. 计算中位数和漂移
      const medianOffset = statistics.median(offsetSamples);
      const oldOffset = this.timeOffset;
      const drift = Math.abs(medianOffset - oldOffset);

      // 3. 计算漂移率
      this._calculateDriftRate(medianOffset);

      // 4. 应用校准（超过阈值才更新）
      if (drift >= this.config.jitterThreshold) {
        this.timeOffset = medianOffset;
      }

      this.lastSuccessfulSync = Date.now();

      // 5. 成功逻辑：重置为默认长间隔并重启定时器
      if (
        this.config.autoSync &&
        this.currentSyncInterval !== this.config.syncInterval
      ) {
        this.currentSyncInterval = this.config.syncInterval;
        this._startAutoSync();
      }
      this.config.onSyncSuccess?.();

      return this.timeOffset;
    } catch (error) {
      // 6. 失败逻辑：切换到短间隔并重启定时器
      this._handleSyncFail(error as Error);

      if (
        this.config.autoSync &&
        this.currentSyncInterval !== this.RETRY_SYNC_INTERVAL
      ) {
        this.currentSyncInterval = this.RETRY_SYNC_INTERVAL;
        this._startAutoSync();
      }

      return this.timeOffset;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 将本地时间戳转换为校准后的同步时间戳。
   */
  public getSyncedTimestamp(rawLocalTimestamp: number): number {
    return rawLocalTimestamp + this.timeOffset;
  }

  /**
   * 获取当前的时钟偏移量（毫秒）。
   */
  public getCurrentOffset(): number {
    return this.timeOffset;
  }

  /**
   * 获取最近一次计算的平均时钟漂移率（PPM）。
   */
  public getDriftRatePPM(): number {
    return this.driftRatePPM;
  }

  /**
   * 启动或重启自动同步定时器。
   */
  private _startAutoSync(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
    }

    if (this.currentSyncInterval <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      this.syncTime();
    }, this.currentSyncInterval) as GlobalTimer;
  }

  private _handleSyncFail(error: Error): void {
    this.config.onSyncFail?.(error);
  }

  /**
   * 销毁定时器和状态。
   */
  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
      this.timer = null;
    }
    this.isSyncing = false;
  }
}
