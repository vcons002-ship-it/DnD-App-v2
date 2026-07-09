/**
 * `localStorage.setItem` that never throws. In a storage-disabled context (some
 * private-mode browsers, or a full quota) a bare setItem throws — and inside a
 * Zustand `set()` updater or a click handler that surfaces as an uncaught error
 * that breaks the interaction. This degrades to non-persistence instead.
 */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — skip persistence, don't break the caller */
  }
}
