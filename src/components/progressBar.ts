export interface ProgressMeter {
  determinate: boolean
  pct: number
  ariaValueMin: number | null
  ariaValueMax: number | null
  ariaValueNow: number | null
  /** `null` no modo indeterminado — é assim que a barra para de mentir "0 / 0". */
  counter: string | null
  ariaValueText: string
}

/**
 * `total` nulo ou zero (ou `done` nulo) vira modo indeterminado: sem contador,
 * sem `aria-valuenow` — é como o ARIA expressa "não sei quanto falta".
 */
export function progressMeter(input: {
  label: string
  done: number | null
  total: number | null
}): ProgressMeter {
  const { label, done, total } = input
  if (total === null || total <= 0 || done === null) {
    return {
      determinate: false,
      pct: 0,
      ariaValueMin: null,
      ariaValueMax: null,
      ariaValueNow: null,
      counter: null,
      ariaValueText: label,
    }
  }
  const clampedDone = Math.max(0, Math.min(done, total))
  const pct = Math.round((clampedDone / total) * 100)
  return {
    determinate: true,
    pct,
    ariaValueMin: 0,
    ariaValueMax: total,
    ariaValueNow: clampedDone,
    counter: `${clampedDone} / ${total}`,
    ariaValueText: `${clampedDone} de ${total}`,
  }
}
