import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * useEvent — stable callback wrapper. The latest function is read on each
 * invocation, so effects can depend on the wrapper without re-subscribing
 * every render.
 *
 * Equivalent to React's experimental `useEvent`; inlined here to avoid
 * pulling a third-party dep just for this one use.
 */
export function useEvent<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  // useCallback kept: stable identity for effect dep arrays — callers live in
  // useLayoutEffect/useEffect dep arrays; without a stable reference those
  // effects loop every render. (exhaustive-deps can't detect this because the
  // dep IS listed, not missing.)
  return useCallback((...args: TArgs) => ref.current(...args), [])
}
