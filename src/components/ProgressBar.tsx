import { progressMeter } from './progressBar'

export interface ProgressBarProps {
  label: string
  done: number | null
  total: number | null
  className?: string
}

/**
 * Barra de progresso genérica — determinada ou indeterminada. `total` nulo ou
 * zero vira uma faixa deslizante sem contador, em vez de mentir "0 / 0".
 */
export function ProgressBar({ label, done, total, className = '' }: ProgressBarProps) {
  const meter = progressMeter({ label, done, total })
  const fillClass = meter.determinate
    ? 'h-full bg-signal transition-all'
    : 'h-full w-2/5 bg-signal progress-indeterminate'

  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={meter.ariaValueMin ?? undefined}
        aria-valuemax={meter.ariaValueMax ?? undefined}
        aria-valuenow={meter.ariaValueNow ?? undefined}
        aria-valuetext={meter.ariaValueText}
        className="h-[3px] w-full overflow-hidden bg-line"
      >
        <div className={fillClass} style={meter.determinate ? { width: `${meter.pct}%` } : undefined} />
      </div>
      {meter.counter && <p className="mt-2 font-mono text-xs tabular-nums text-muted">{meter.counter}</p>}
    </div>
  )
}
