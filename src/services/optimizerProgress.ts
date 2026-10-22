export const PROGRESS_POLL_MS = 500

export interface OptimizerProgress {
  processed: number
  total: number
}

const COUNTER_WORDS = 2
const COUNTER_BYTES = COUNTER_WORDS * Uint32Array.BYTES_PER_ELEMENT

/**
 * O fsrs-browser grava [itens processados, total] como dois Uint32 a partir do
 * ponteiro de `Progress.pointer()`; só é seguro ler enquanto o cálculo roda.
 */
export function readOptimizerProgress(buffer: ArrayBufferLike, pointer: number): OptimizerProgress | null {
  if (pointer < 0 || pointer + COUNTER_BYTES > buffer.byteLength) return null
  const [processed, total] = new Uint32Array(buffer, pointer, COUNTER_WORDS)
  if (total === 0 || processed > total) return null
  return { processed, total }
}

export function advanceProgress(
  previous: OptimizerProgress | null,
  next: OptimizerProgress | null,
): OptimizerProgress | null {
  if (!next) return previous
  if (!previous) return next
  return next.processed / next.total < previous.processed / previous.total ? previous : next
}
