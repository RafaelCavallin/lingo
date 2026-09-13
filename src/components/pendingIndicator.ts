/** Abaixo disso, mostrar o skeleton pisca mais do que ajuda — a maioria das
 *  leituras do Dexie resolve nessa janela. */
export const SHOW_DELAY_MS = 120
/** Uma vez visível, fica pelo menos esse tempo — evita o flash de quem chegou
 *  a aparecer por um frame e sumir. */
export const MIN_VISIBLE_MS = 300

export interface PendingWindowState {
  pendingSince: number | null
  shownAt: number | null
}

export interface PendingWindowResult extends PendingWindowState {
  visible: boolean
  /** Daqui a quantos ms reavaliar — `null` quando não há nada a esperar. */
  nextCheckInMs: number | null
}

export const INITIAL_PENDING_WINDOW: PendingWindowState = { pendingSince: null, shownAt: null }

/**
 * Máquina pura da antipiscada: dado o estado anterior, se ainda está pendente
 * e o relógio atual, decide se o indicador aparece agora. `now` é sempre
 * recebido de fora — nunca `Date.now()` aqui — para o teste ser determinístico.
 */
export function nextPendingWindow(
  state: PendingWindowState,
  pending: boolean,
  now: number,
  options: { showDelayMs: number; minVisibleMs: number },
): PendingWindowResult {
  const { showDelayMs, minVisibleMs } = options
  if (pending) {
    const pendingSince = state.pendingSince ?? now
    if (state.shownAt !== null) return { pendingSince, shownAt: state.shownAt, visible: true, nextCheckInMs: null }
    const elapsed = now - pendingSince
    if (elapsed >= showDelayMs) return { pendingSince, shownAt: now, visible: true, nextCheckInMs: null }
    return { pendingSince, shownAt: null, visible: false, nextCheckInMs: showDelayMs - elapsed }
  }
  if (state.shownAt === null) return { pendingSince: null, shownAt: null, visible: false, nextCheckInMs: null }
  const visibleFor = now - state.shownAt
  if (visibleFor >= minVisibleMs) return { pendingSince: null, shownAt: null, visible: false, nextCheckInMs: null }
  return { pendingSince: null, shownAt: state.shownAt, visible: true, nextCheckInMs: minVisibleMs - visibleFor }
}
