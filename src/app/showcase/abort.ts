// React StrictMode mounts effects twice in development, so the first fetch is
// aborted on cleanup. Treat that as a cancellation, not a failure.
export function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}
