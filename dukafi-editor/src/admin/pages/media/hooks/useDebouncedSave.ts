/**
 * useDebouncedSave — local field state + debounced persist.
 *
 * Pattern used by every editable inspector field: keystrokes update local
 * state immediately (responsive UI), and 500 ms after the user stops typing
 * the value gets POSTed via the supplied `save` callback. Calling `save`
 * with no debounce (e.g. on blur) is exposed via `flush`.
 *
 * Resets local state whenever the external `value` changes — so switching
 * to a new asset in the inspector wipes the in-flight edit on the old one
 * rather than carrying it over.
 */
import { useEffect, useRef, useState } from 'react'

interface UseDebouncedSaveOptions<T> {
  /** Current persisted value — drives the reset on external change. */
  value: T
  /** Async save callback. Errors are the caller's problem to surface. */
  save: (next: T) => Promise<void> | void
  /** Debounce window in milliseconds. Defaults to 500 ms. */
  delay?: number
  /** Equality check — defaults to `Object.is`. Useful for arrays / objects. */
  equals?: (a: T, b: T) => boolean
}

interface UseDebouncedSaveResult<T> {
  local: T
  /** Mutate local state and re-arm the debounce timer. */
  setLocal: (next: T) => void
  /** Immediately persist whatever's in local state (e.g. on blur). */
  flush: () => Promise<void>
  /** `true` between the first keystroke and the next successful save. */
  dirty: boolean
}

export function useDebouncedSave<T>({
  value,
  save,
  delay = 500,
  equals = Object.is,
}: UseDebouncedSaveOptions<T>): UseDebouncedSaveResult<T> {
  const [local, setLocalState] = useState<T>(value)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localRef = useRef<T>(value)
  const saveRef = useRef(save)
  const equalsRef = useRef(equals)
  const valueRef = useRef<T>(value)

  useEffect(() => { saveRef.current = save }, [save])
  useEffect(() => { equalsRef.current = equals }, [equals])

  // Reset when the external value changes — but only when the change isn't
  // just our own save completing. Otherwise we'd snap the local edit back to
  // the just-saved value mid-typing and lose keystrokes. setState-in-effect
  // is intentional here: we ARE syncing local state from an external source.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!equalsRef.current(value, valueRef.current)) {
      valueRef.current = value
      if (!dirty) {
        setLocalState(value)
        localRef.current = value
      }
    }
  }, [value, dirty])
  /* eslint-enable react-hooks/set-state-in-effect */

  const flush = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirty) return
    const snapshot = localRef.current
    await saveRef.current(snapshot)
    setDirty(false)
    valueRef.current = snapshot
  }

  const setLocal = (next: T) => {
    setLocalState(next)
    localRef.current = next
    setDirty(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const snapshot = localRef.current
      void Promise.resolve(saveRef.current(snapshot)).then(() => {
        setDirty(false)
        valueRef.current = snapshot
      })
    }, delay)
  }

  // Flush on unmount so navigating away doesn't drop the pending edit.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        // Fire-and-forget — the component is gone so there's no UI to wait on.
        void Promise.resolve(saveRef.current(localRef.current))
      }
    }
  }, [])

  return { local, setLocal, flush, dirty }
}
