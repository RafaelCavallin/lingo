import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessageOf, shouldStart } from './asyncAction'

export interface AsyncAction<A extends unknown[]> {
  run: (...args: A) => Promise<void>
  busy: boolean
  error: string | null
  reset: () => void
}

/** Ação assíncrona com estado de espera e guarda de reentrância — o segundo
 *  clique no mesmo tick não abre uma segunda corrida. */
export function useAsyncAction<A extends unknown[]>(action: (...args: A) => Promise<void>): AsyncAction<A> {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const mounted = useRef(true)

  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  const run = useCallback(
    async (...args: A) => {
      if (!shouldStart(busyRef.current)) return
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        await action(...args)
      } catch (e) {
        if (mounted.current) setError(errorMessageOf(e))
      } finally {
        busyRef.current = false
        if (mounted.current) setBusy(false)
      }
    },
    [action],
  )

  const reset = useCallback(() => setError(null), [])

  return { run, busy, error, reset }
}
