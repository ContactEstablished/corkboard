/** Optional browser-local persistence for the mock repositories (dev only). */

export interface Persistence {
  load<T>(key: string): T | undefined
  save<T>(key: string, value: T): void
}

export const noPersistence: Persistence = {
  load: () => undefined,
  save: () => {},
}

/** localStorage-backed. Every access is guarded: storage may be blocked or full. */
export function localStoragePersistence(namespace: string): Persistence {
  const k = (key: string) => `${namespace}:${key}`
  return {
    load<T>(key: string): T | undefined {
      try {
        const raw = window.localStorage.getItem(k(key))
        return raw ? (JSON.parse(raw) as T) : undefined
      } catch {
        return undefined
      }
    },
    save<T>(key: string, value: T): void {
      try {
        window.localStorage.setItem(k(key), JSON.stringify(value))
      } catch {
        /* storage unavailable — the demo simply won't persist */
      }
    },
  }
}
