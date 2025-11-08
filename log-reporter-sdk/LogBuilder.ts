/**
 * LogBuilder.ts
 * 包含 LogBuilder 类，用于构造独立的日志对象。非单例，每次上报创建新实例。
 */

import type { LogLevel, LogScene, LogContext } from "./LogTypes";

export class LogBuilder {
  private payload: Record<string, any> = {};
  private scene: Partial<LogScene> = {};
  private context: Partial<LogContext> = {};
  private type: string = "info";
  private level: LogLevel = "info";

  /**
   * LogBuilder 构造函数。
   * @param type 日志的类型（用于路由）
   * @param level 日志的级别（用于分类）
   */
  protected constructor(type: string, level: LogLevel) {
    this.type = type;
    this.level = level;
    this.payload.level = level;
  }

  // --- 核心方法：静态工厂函数 (通用方法) ---

  /**
   * 通用的静态工厂函数，用于构造新的 LogBuilder 实例。
   * 允许在构造时传入初始数据。
   * @param type 日志的类型（用于路由）。
   * @param level 日志的级别（用于分类）。
   * @param payload (可选) 核心数据。
   * @param scene (可选) 场景信息。
   * @param context (可选) 临时上下文。
   * @returns 一个新的 LogBuilder 实例。
   */
  public static log(
    type: string,
    level: LogLevel,
    payload?: Record<string, any>,
    scene?: Partial<LogScene>,
    context?: Partial<LogContext>
  ): LogBuilder {
    const builder = new LogBuilder(type, level);

    // 如果传入了数据，则立即设置
    if (payload) {
      builder.setPayload(payload);
    }
    if (scene) {
      builder.setScene(scene);
    }
    if (context) {
      builder.setContext(context);
    }

    return builder;
  }

  // --- 快捷工厂函数 (基于 LogBuilder.log 方法重构) ---

  /**
   * 创建 Info 级别的日志。
   */
  public static info(
    type: string = "info",
    payload?: Record<string, any>,
    scene?: Partial<LogScene>,
    context?: Partial<LogContext>
  ): LogBuilder {
    return LogBuilder.log(type, "info", payload, scene, context);
  }

  /**
   * 创建 Error 级别的日志。
   */
  public static error(
    type: string = "error",
    payload?: Record<string, any>,
    scene?: Partial<LogScene>,
    context?: Partial<LogContext>
  ): LogBuilder {
    return LogBuilder.log(type, "error", payload, scene, context);
  }

  /**
   * 创建 Metric 级别的监控日志。
   */
  public static monitor(
    type: string = "monitor",
    payload?: Record<string, any>,
    scene?: Partial<LogScene>,
    context?: Partial<LogContext>
  ): LogBuilder {
    return LogBuilder.log(type, "metric", payload, scene, context);
  }

  // --- 新增方法：设置完整日志数据 ---

  /**
   * 允许用户设置完整的核心日志数据（Payload），它将覆盖构造函数设置的默认级别。
   * @param data 包含要发送的核心数据（可能已包含 level 字段）。
   */
  public setFullPayload(data: Record<string, any>): LogBuilder {
    this.payload = data;

    const userLevel = data.level as LogLevel;
    if (userLevel) {
      this.level = userLevel;
    }

    return this;
  }

  // --- 现有方法：设置或合并日志数据 ---
  public setPayload(data: Record<string, any>): LogBuilder {
    Object.assign(this.payload, data);
    return this;
  }

  public setScene(data: Partial<LogScene>): LogBuilder {
    Object.assign(this.scene, data);
    return this;
  }

  public setContext(data: Partial<LogContext>): LogBuilder {
    Object.assign(this.context, data);
    return this;
  }

  // --- 数据获取方法 ---
  public getPayload(): Record<string, any> {
    return this.payload;
  }

  public getType(): string {
    return this.type;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public getScene(): Partial<LogScene> {
    return this.scene;
  }

  public getContext(): Partial<LogContext> {
    return this.context;
  }
}
