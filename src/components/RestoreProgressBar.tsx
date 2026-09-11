import type { RestoreProgress } from '../services/backupRestore'

export function RestoreProgressBar({ progress }: { progress: RestoreProgress }) {
  const label = progress.phase === 'data' ? 'Restaurando seus cartões' : 'Restaurando o áudio'
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  return (
    <div role="status" aria-live="polite">
      <h1 className="font-display text-3xl">{label}…</h1>
      <div className="mt-6 h-[3px] w-full bg-line">
        <div className="h-full bg-signal transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 font-mono text-xs tabular-nums text-muted">
        {progress.done} / {progress.total}
      </p>
    </div>
  )
}
