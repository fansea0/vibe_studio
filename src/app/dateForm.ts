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
