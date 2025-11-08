/**
 * TimeSynchronizer.ts
 * 负责前端与 NTP 服务器的时间同步和时钟漂移计算。
 */

import type { SDKOptions } from "./LogTypes";

// TimeSynchronizer 只需要这些配置
type TimeSyncOptions = Pick<SDKOptions, "autoSync" | "jitterThreshold"> & {
  ntpUrl: string;
};

export class TimeSynchronizer {
  private timeOffset: number = 0;
  private lastSyncOffset: number = 0;
  private config: TimeSyncOptions;
  private isSyncing: boolean = false;

  /**
   * @param options 包含 ntpUrl, autoSync, jitterThreshold 的配置
   */
  constructor(options: TimeSyncOptions) {
    this.config = options;
    if (this.config.autoSync && this.config.ntpUrl) {
      this.syncTime();
    }
  }

  /**
   * 运行时更新 NTP URL，用于环境切换。
   */
  public setNtpUrl(url: string): void {
    this.config.ntpUrl = url;
  }

  /**
   * 获取当前计算出的时钟漂移量 (Server Time - Local Time)。
   */
  public getTimeOffset(): number {
    return this.timeOffset;
  }

  /**
   * 将本地时间转换为同步后的时间戳。
   */
  public getSyncedTimestamp(localTime: number = Date.now()): number {
    return localTime + this.timeOffset;
  }

  /**
   * 尝试与NTP服务器同步时间。
   */
  public async syncTime(): Promise<number> {
    const url = this.config.ntpUrl;
    // 如果 ntpUrl 为空，直接返回
    if (this.isSyncing || !url) {
      this.timeOffset = this.timeOffset || 0;
      return this.timeOffset;
    }

    this.isSyncing = true;
    const localTimeBefore = Date.now();

    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const serverTimeData = await response.json();
      const serverTimestamp =
        serverTimeData.serverTime || serverTimeData.timestamp;
      if (typeof serverTimestamp !== "number")
        throw new Error("NTP 接口返回格式不正确。");

      const localTimeAfter = Date.now();
      const networkDelay = (localTimeAfter - localTimeBefore) / 2;
      const estimatedServerTime = serverTimestamp + networkDelay;
      const newOffset = estimatedServerTime - localTimeAfter;

      const jitter = Math.abs(newOffset - this.lastSyncOffset);
      const threshold = this.config.jitterThreshold || 500;

      if (this.lastSyncOffset === 0 || jitter > threshold) {
        this.timeOffset = newOffset;
        this.lastSyncOffset = newOffset;
      }
      return this.timeOffset;
    } catch (error) {
      this.timeOffset = this.lastSyncOffset || 0;
      return this.timeOffset;
    } finally {
      this.isSyncing = false;
    }
  }
}
