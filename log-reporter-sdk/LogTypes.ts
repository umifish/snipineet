/**
 * LogTypes.ts
 * 包含 LogReporter 和 LogBuilder 共享的所有类型定义，以及全局 Window 接口的增强。
 */

import type { LogReporter } from "./LogReporter";
import { GLOBAL_KEY } from "./constants";

// --- 核心 SDK 类型 ---

export type LogLevel = "error" | "warn" | "info" | "metric" | "debug" | string;

/**
 * LogContext: 日志的全局上下文信息。
 */
export interface LogContext {
  clientId: string;
  userId: string | null;
  serverName: string;
  env: "development" | "production" | string;
  pageUrl: string;
  userAgent: string;
  [key: string]: any;
}

/**
 * LogScene: 日志发生的场景信息。
 */
export interface LogScene {
  source: string;
  pagePath: string;
  eventType: string;
  component?: string;
  [key: string]: any;
}

/**
 * EnvUrlsConfig: 包含不同环境和不同日志类型的 API 路径配置。
 */
export interface EnvUrlsConfig {
  [env: string]: {
    default: string;
    [type: string]: string; // 可以为 info, error, monitor 等设置特定路径
  };
}

/**
 * EnvSpecificConfig: 包含环境特定的配置项（如 NTP URL）。
 */
export interface EnvSpecificConfig {
  [env: string]: {
    ntpUrl: string;
    [key: string]: any;
  };
}

/**
 * SDKOptions: SDK 的运行时配置选项（通用配置）。
 */
export interface SDKOptions {
  maxLogs: number;
  interval: number;
  separateByUrl: boolean;
  enableUnloadReport: boolean;
  autoSync: boolean;
  jitterThreshold: number;
  customHeaders: Record<string, string>;
  disabled: boolean;
  disabledHosts: string[];
}

/**
 * LogReporterConfig: 实例化 LogReporter 时传入的整体配置结构。
 */
export interface LogReporterConfig {
  envUrls: EnvUrlsConfig;
  envConfig: EnvSpecificConfig; // 按环境分类的 NTP URL 等配置
  context: Partial<LogContext>;
  options: Partial<SDKOptions>;
}

/**
 * LogEntry: 最终发送到后端的单条日志数据结构。
 */
export interface LogEntry {
  type: string;
  timestamp: number;
  sequence: number;
  isoTime: string;

  level: LogLevel;
  scene: LogScene;

  clientId: string;
  userId: string | null;
  serverName: string;
  env: "development" | "production" | string;
  pageUrl: string;
  userAgent: string;

  [key: string]: any;
}

/**
 * LogBuilderOutput: LogBuilder 实例能够收集的所有字段的集合。
 */
export interface LogBuilderOutput {
  type: string;
  level: LogLevel;
  scene: Partial<LogScene>;
  context: Partial<LogContext>;
  payload: Record<string, any>;
}

// --- 环境增强类型 ---

declare interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}
declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    [GLOBAL_KEY]?: LogReporter;
  }
}
