export const mutationErrorMessage = (error: unknown, fallback: string): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? error.code === 'LOCK_UNAVAILABLE'
      ? '当前无法安全获取写入锁，请稍后重试'
      : error.code === 'PRODUCT_CONFLICT'
        ? '产品已在其他窗口更新，你的草稿已保留'
        : fallback
    : fallback
