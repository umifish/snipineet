import type { LogDataPacket } from '../core/type'

// constants
export const MAX_LOG_CACHE_SIZE = 10000 // 最大日志缓存数量

// comparator
export type Comparator<T> = (a: T, b: T) => number
export type LogComparator = Comparator<LogDataPacket>

export const logComparator: LogComparator = (a, b) => {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp
  }

  return a.sequence - b.sequence
}

// insertion
export const findInsertionIndex = <T>(item: T, array: T[], comparator: Comparator<T>) => {
  let high = array.length
  let low = 0

  while (low < high) {
    const mid = Math.floor((low + high) / 2)

    if (comparator(array[mid], item) < 0) {
      low = mid + 1
    }
    else {
      high = mid
    }
  }

  return low
}

export interface InsertLogsOptions<T extends LogDataPacket> {
  comparator?: Comparator<T>
  onDuplicate?: (id: T['id'], timestamp?: T['timestamp']) => void
}

export const deduplicateLogs = <T extends LogDataPacket>(logs: T[], options?: InsertLogsOptions<T>) => {
  const { onDuplicate } = options || {}
  const seenIds = new Set<string | number>()
  const uniqueLogs: T[] = []

  for (const log of logs) {
    if (!seenIds.has(log.id)) {
      seenIds.add(log.id)
      uniqueLogs.push(log)
    }
    else {
      if (typeof onDuplicate === 'function') {
        onDuplicate(log.id, log.timestamp)
      }
      else {
        console.warn(`[Logger] 发现重复的日志 ID: ${log.id}, 时间戳: ${log.timestamp}, 已跳过`)
      }
    }
  }

  return uniqueLogs
}

export const insertLogsOrdered = <T extends LogDataPacket>(newLogs: T[], targetLogs: T[], targetLogIdSet?: Set<string | number>, options?: InsertLogsOptions<T>) => {
  const { comparator = logComparator } = options || {}

  if (newLogs.length === 0) {
    return
  }

  const firstNewLog = newLogs[0]
  const lastNewLog = newLogs[newLogs.length - 1]
  const logIdSet = targetLogIdSet || new Set<string | number>(targetLogs.map(log => log.id))

  // insertion range indexes
  const startIdx = findInsertionIndex(firstNewLog, targetLogs, comparator)
  const endIdx = findInsertionIndex(lastNewLog, targetLogs, comparator)

  // slice & merge
  const overlappingOldLogs = targetLogs.slice(startIdx, endIdx)
  const logsToMerge = [...overlappingOldLogs, ...newLogs]

  // deduplicate
  const uniqueMergedLogs = deduplicateLogs(logsToMerge, options)

  // sort
  uniqueMergedLogs.sort(comparator)

  // rebuild
  const oldSegmentLength = endIdx - startIdx
  const removedLogs = targetLogs.slice(startIdx, startIdx + oldSegmentLength)

  removedLogs.forEach((log) => logIdSet.delete(log.id))
  uniqueMergedLogs.forEach((log) => logIdSet.add(log.id))
  targetLogs.splice(startIdx, oldSegmentLength, ...uniqueMergedLogs)
}

// export
export const exportToJson = <T>(data: T, filename?: string) => {
  try {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
  
    a.href = url
    a.download = filename || `export_${Date.now()}.json`
    document.body.appendChild(a)
  
    a.click()
  
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  catch (e) {
    console.error('[Logger] Failed to download data file: ', e)
  }
}

export const exportLogsToJson = (logs: LogDataPacket[], filename?: string) => {
  exportToJson(logs, filename || `export_${Date.now()}.log`)
}
