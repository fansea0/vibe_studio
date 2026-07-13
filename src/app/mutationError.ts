export const mutationErrorMessage = (error: unknown, fallback: string): string =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'LOCK_UNAVAILABLE'
    ? '当前浏览器不支持安全的跨窗口写入，请升级浏览器后重试'
    : fallback
