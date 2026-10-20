const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export const isValidDateValue = (value: string): boolean => {
  const match = DATE_PATTERN.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const dateValueToIso = (value: string): string => `${value}T00:00:00.000Z`

export const getLocalDateValue = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isoToDateValue = (value: string | null): string => value?.slice(0, 10) ?? ''

/**
 * 截止日期在 SQLite 里的存储契约是 `YYYY-MM-DD`。
 * 旧数据可能存的是完整 ISO 串，这里统一裁成日期部分，写入时不再带时区后缀，
 * 否则服务端 `ensureWork` 的校验会因为格式不符直接拒绝保存。
 */
export const dueDateToStorage = (value: string): string => value.slice(0, 10)

export const formatRelativeDays = (iso: string): string => {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const diffMs = Date.now() - ms
  const days = Math.floor(diffMs / (24 * 3600 * 1000))
  if (days < 1) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return isoToDateValue(iso)
}
