export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'MONITOR' | string

export type FilterMode = 'ALL' | 'NONE' | 'LEVEL' | 'GROUP_ID' | 'CLIENT_ID' | 'USER_ID'

export interface LogDataPacket {
  id: string | number
  groupId: string
  userId: string | number
  clientId: string
  serviceName: string
  logLevel: LogLevel
  timestamp: number
  sequence: number
  info: string
  moreInfo?: string
  formattedMessage: string
  extraData?: Record<string, any>
  [key: string]: any
}

export interface LogEntry {
  to: Record<string, any>
  resourceId: string
  resourceName: string
  data: LogDataPacket
}
