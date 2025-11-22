import type { LogDataPacket } from '../stores/type'

/**
 * 导出日志为 JSON 文件
 * @param logs 要导出的日志数组
 * @param filename 文件名（可选，默认为带时间戳的文件名）
 */
export const exportLogsToJson = (logs: LogDataPacket[], filename?: string) => {
  const json = JSON.stringify(logs, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = filename || `log_export_${Date.now()}.json`
  document.body.appendChild(a)

  a.click()

  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

