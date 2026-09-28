/**
 * Tiny localStorage wrapper. Storage can be unavailable (private mode,
 * blocked site data, embedded previews), so every access is guarded and the
 * app keeps working in memory.
 */
export const storage = {
  read<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* in-memory only */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
