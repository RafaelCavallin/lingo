import { useEffect, useRef, useState } from 'react'
import {
  INITIAL_PENDING_WINDOW,
  MIN_VISIBLE_MS,
  SHOW_DELAY_MS,
  nextPendingWindow,
  type PendingWindowState,
} from './pendingIndicator'

export interface PendingIndicatorOptions {
  showDelayMs?: number
  minVisibleMs?: number
}

/** Antipiscada: só mostra o skeleton depois de `showDelayMs`, e uma vez
 *  visível fica pelo menos `minVisibleMs`. A reserva de espaço é do contêiner
 *  de quem chama — este hook só decide quando o retângulo cinza aparece. */
export function usePendingIndicator(pending: boolean, options: PendingIndicatorOptions = {}): boolean {
  const showDelayMs = options.showDelayMs ?? SHOW_DELAY_MS
  const minVisibleMs = options.minVisibleMs ?? MIN_VISIBLE_MS
  const state = useRef<PendingWindowState>(INITIAL_PENDING_WINDOW)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const evaluate = () => {
      const result = nextPendingWindow(state.current, pending, Date.now(), { showDelayMs, minVisibleMs })
      state.current = { pendingSince: result.pendingSince, shownAt: result.shownAt }
      setVisible(result.visible)
      return result.nextCheckInMs
    }
    const nextCheckInMs = evaluate()
    if (nextCheckInMs === null) return undefined
    const id = window.setTimeout(evaluate, nextCheckInMs)
    return () => window.clearTimeout(id)
  }, [pending, showDelayMs, minVisibleMs])

  return visible
}
