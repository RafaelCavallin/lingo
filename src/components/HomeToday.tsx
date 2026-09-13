import { Heatmap, HEATMAP_HEIGHT } from './Heatmap'
import { Skeleton } from './Skeleton'
import { studyButtonLabel } from './homeSummary'

export function HomeToday({
  queueSize,
  minutes,
  onStudy,
  byDay,
  byDayLoading,
  onProgress,
}: {
  queueSize: number | null
  minutes: number
  onStudy: () => void
  byDay: Map<string, number> | undefined
  byDayLoading: boolean
  onProgress: () => void
}) {
  const hasHistory = (byDay?.size ?? 0) > 0

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-signal">Hoje</p>

      {queueSize === null ? (
        <Skeleton shape="text" width="3ch" height="4.5rem" className="mt-5" />
      ) : (
        <p className="mt-5 font-display text-7xl leading-none tabular-nums sm:text-8xl">{queueSize}</p>
      )}

      {queueSize === null ? (
        <Skeleton shape="text" width="12rem" height="1.75rem" className="mt-3" />
      ) : (
        <p className="mt-3 text-lg text-muted">
          {queueSize === 1 ? 'frase para revisar' : 'frases para revisar'}
          {queueSize ? ` · cerca de ${minutes} min` : ''}
        </p>
      )}

      <button
        onClick={onStudy}
        disabled={!queueSize}
        aria-busy={queueSize === null}
        className="mt-10 self-start rounded-full bg-signal px-8 py-4 text-lg font-medium text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
      >
        {studyButtonLabel(queueSize)}
      </button>

      {byDayLoading && <Skeleton shape="block" height={`${HEATMAP_HEIGHT}px`} className="mt-14" />}
      {!byDayLoading && hasHistory && byDay && (
        <button
          onClick={onProgress}
          aria-label="Ver progresso"
          className="mt-14 rounded-xl border border-transparent p-2 text-left transition hover:border-line"
        >
          <Heatmap counts={byDay} />
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-muted">
            Ver progresso →
          </span>
        </button>
      )}
    </>
  )
}
