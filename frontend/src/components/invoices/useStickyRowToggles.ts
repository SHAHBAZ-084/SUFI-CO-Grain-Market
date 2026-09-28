import { useCallback, useState } from 'react';

/**
 * Row-level boolean toggles (e.g. Dammi) that stay set across "Add to grid"
 * within one invoice session.
 *
 * Keep these outside the row-input clear step. Call `resetStickyToggles()` only
 * after a successful save (or leave the form — unmount discards state).
 * Unticking affects only future rows; grid rows keep the value they were added with.
 */
export function useStickyRowToggles<T extends Record<string, boolean>>(
  initial: T | (() => T),
) {
  const [stickyToggles, setStickyToggles] = useState(initial);

  const setStickyToggle = useCallback(<K extends keyof T>(key: K, checked: boolean) => {
    setStickyToggles((prev) => {
      if (prev[key] === (checked as T[K])) return prev;
      return { ...prev, [key]: checked as T[K] };
    });
  }, []);

  const resetStickyToggles = useCallback(() => {
    setStickyToggles((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as Array<keyof T>) {
        next[key] = false as T[keyof T];
      }
      return next;
    });
  }, []);

  return { stickyToggles, setStickyToggle, resetStickyToggles };
}
