import { useRef } from 'react';

/**
 * Keep a value's identity while its content is unchanged. Every snapshot
 * rebuilds plain data (map walls, measurements, …) as fresh objects, which
 * defeats `memo`/`===` prop checks downstream; this returns the previous object
 * until the serialized content actually differs. Only for small JSON-able data.
 */
export function useContentStable<T>(value: T): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  const key = JSON.stringify(value) ?? '';
  if (!ref.current || ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}
