import type { LogLevel, LogDataPacket } from './type'

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

/**
 * 日志比较函数：首先按时间戳升序，时间戳相同时按 sequence 升序
 * 用于排序日志数组
 */
const logComparator = (a: LogDataPacket, b: LogDataPacket): number => {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp
  }
  return a.sequence - b.sequence
}

// Mock 日志 ID 计数器
let mockLogIdCounter = MAX_MOCK_HISTORY_SIZE

/**
 * 获取日志级别的 ANSI 颜色代码
 */
const getLogColor = (level: LogLevel): string => {
  switch (level) {
    case "ERROR":
      return "\x1b[31m"
    case "WARN":
      return "\x1b[33m"
    case "INFO":
      return "\x1b[32m"
    case "DEBUG":
      return "\x1b[90m"
    default:
      return "\x1b[0m"
  }
}

/**
 * 格式化日志为终端显示字符串
 */
export const formatLog = (item: Omit<LogDataPacket, "formattedMessage">): string => {
  const reset = "\x1b[0m"
  const dim = "\x1b[90m"
  const color = getLogColor(item.logLevel)

  // 【修复】格式化时间戳为本地时间，而不是 UTC 时间
  // toISOString() 返回的是 UTC 时间，会导致时区偏差（例如 GMT+8 会少 8 小时）
  // 使用本地时间格式化：YYYY-MM-DD HH:mm:ss.SSS
  const formatLocalTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    const seconds = String(date.getSeconds()).padStart(2, "0")
    const milliseconds = String(date.getMilliseconds()).padStart(3, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
  }

  // 格式化：时间戳 (本地时间) + Sequence (4位)
  return [
    `${dim}${formatLocalTime(item.timestamp)}${reset}`,
    `${dim}${item.sequence.toString().padStart(4, "0")}${reset}`,
    `[\x1b[36m${item.serviceName.padEnd(12)}${reset}]`,
    `\x1b[34m${item.userId.padEnd(8)}${reset}`,
    `${color}${item.logLevel.padEnd(5)}${reset}`,
    `${item.info}`,
  ].join("  ")
}

/**
 * 生成单个模拟日志
 */
const mockLogGeneration = (
  id: number,
  timestamp: number,
  isHistorical: boolean
): LogDataPacket => {
  const logLevel: LogLevel = ["INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR"][
    Math.floor(Math.random() * 6)
  ] as LogLevel
  const serviceName =
    MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)]
  const userIdRaw = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)]
  const userId = userIdRaw || "guest" // LogDataPacket 的 userId 是 string，不是 null
  const groupId = MOCK_GROUPS[Math.floor(Math.random() * MOCK_GROUPS.length)]
  const clientId =
    MOCK_CLIENTS[Math.floor(Math.random() * MOCK_CLIENTS.length)]
  const info = isHistorical
    ? `[History #${id}] Log message for ${serviceName} at level ${logLevel}.`
    : `[LIVE #${id}] Processing request for ${userId}.`

  // 生成 Sequence (0-999)
  const sequence = Math.floor(Math.random() * 1000)

  const formattedMessage = formatLog({
    id,
    timestamp,
    sequence,
    logLevel,
    serviceName,
    userId,
    groupId,
    clientId,
    info,
  })

  const result: LogDataPacket = {
    id,
    timestamp,
    sequence,
    logLevel,
    serviceName,
    userId,
    groupId,
    clientId,
    info,
    formattedMessage,
  }

  return result
}

/**
 * 用于初始化的模拟函数：生成指定数量的模拟日志
 */
export const generateMockLogs = (
  count: number,
  startId: number,
  startTime: number
): LogDataPacket[] => {
  const logs: LogDataPacket[] = []
  let currentTimestamp = startTime
  for (let i = 0; i < count; i++) {
    const id = startId + i
    currentTimestamp += 100 // 时间递增
    logs.push(mockLogGeneration(id, currentTimestamp, false))
  }
  return logs
}

/**
 * 模拟一个基于时间戳的 API 轮询 (拉取新日志)。
 * 新日志模拟存在时间戳交错。
 */
export const pullNewLogsMockAPI = (
  sinceTimestamp: number,
  limit: number
): LogDataPacket[] => {
  const newLogs: LogDataPacket[] = []
  const logCount = Math.min(
    limit,
    10 + Math.floor(Math.random() * (limit - 10))
  )

  let currentTimestamp = sinceTimestamp

  for (let i = 0; i < logCount; i++) {
    currentTimestamp += 50 + Math.floor(Math.random() * 50)
    mockLogIdCounter++

    const logItem = mockLogGeneration(
      mockLogIdCounter,
      currentTimestamp,
      false
    )

    // 模拟时间戳重复/交错的场景，使其与缓存末尾日志交错
    if (i > 0 && Math.random() < 0.1) {
      logItem.timestamp = newLogs[i - 1].timestamp
    }

    newLogs.push(logItem)
  }

  newLogs.sort(logComparator)

  return newLogs
}

/**
 * 模拟一个基于时间范围的 API 查询，用于历史数据加载 (拉取旧日志)。
 * 查询范围为 (startTime, endTime]。
 */
export const pullOlderLogsMockAPI = (
  startTime: number,
  endTime: number,
  limit: number
): LogDataPacket[] => {
  const olderLogs: LogDataPacket[] = []

  const logCount = Math.min(
    limit,
    10 + Math.floor(Math.random() * (limit - 10))
  )
  const timeRange = endTime - startTime

  for (let i = 0; i < logCount * 2; i++) {
    // 尝试生成更多日志以满足 limit

    // 在 [startTime, endTime] 范围内随机生成时间戳
    const logTimestamp = startTime + Math.random() * timeRange

    // 模拟一个旧 ID (ID 从 1 到 MAX_MOCK_HISTORY_SIZE)
    const mockHistoricalId =
      1 + Math.floor(Math.random() * MAX_MOCK_HISTORY_SIZE)

    const logItem = mockLogGeneration(mockHistoricalId, logTimestamp, true)

    // 确保它在时间范围 (startTime, endTime] 内
    if (logItem.timestamp > startTime && logItem.timestamp <= endTime) {
      olderLogs.push(logItem)
    }
  }

  // 历史日志必须按时间升序返回
  olderLogs.sort(logComparator)

  // 模拟 API 仅返回 limit 条（通常是最旧的那些）
  return olderLogs.slice(0, limit)
}

