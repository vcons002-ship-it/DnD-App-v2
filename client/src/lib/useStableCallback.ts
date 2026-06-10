import { useCallback, useRef } from 'react';

/** Identity-stable wrapper around an inline handler: the returned function never
 *  changes between renders but always invokes the latest closure. Lets memoized
 *  children (e.g. TokenShape) skip re-renders without stale-callback bugs. */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((...args: A) => ref.current(...args), []);
}
