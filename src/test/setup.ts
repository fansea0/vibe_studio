import '@testing-library/jest-dom/vitest'

// Node 22+ ships an experimental global `localStorage` that stays undefined unless
// `--localstorage-file` is provided, and it shadows the jsdom implementation that
// vitest exposes. Repository tests rely on a working Storage, so restore one.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    clear: () => { store.clear() },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key) },
    setItem: (key: string, value: string) => { store.set(String(key), String(value)) },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true, writable: true })
}
