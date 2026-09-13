import { useEffect, useState } from 'react'
import { estimateBackupSize, type BackupSizeEstimate } from '../services/backupRecords'
import { useNavigation } from '../contexts/NavigationContext'
import { formatBytes } from './formatBytes'
import { ProgressBar } from './ProgressBar'
import { Skeleton } from './Skeleton'
import { Section, Toggle } from './SettingsControls'
import { useAsyncAction } from './useAsyncAction'

export function BackupSection() {
  const { navigate } = useNavigation()
  const [withNarrations, setWithNarrations] = useState(false)
  const [estimate, setEstimate] = useState<BackupSizeEstimate | null>(null)
  const [zipPct, setZipPct] = useState<number | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void estimateBackupSize().then((e) => {
      if (!cancelled) setEstimate(e)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const base = estimate ? estimate.data + estimate.recordings : 0
  const total = estimate ? base + (withNarrations ? estimate.narrations : 0) : 0

  const backupAction = useAsyncAction(async () => {
    setDownloaded(false)
    setZipPct(0)
    try {
      const { downloadBackup } = await import('../services/backupExport')
      await downloadBackup({ includeNarrations: withNarrations, onProgress: setZipPct })
      setDownloaded(true)
    } finally {
      setZipPct(null)
    }
  })

  return (
    <Section title="Backup e restauração">
      <p className="text-sm text-muted">
        O arquivo leva seus baralhos, cartões, histórico de revisões e as gravações da sua voz —
        que não são sincronizadas e só existem neste aparelho. Guarde-o fora do navegador.
      </p>
      <div className="mt-4">
        <Toggle
          label="Incluir as narrações já geradas"
          checked={withNarrations}
          onChange={setWithNarrations}
          hint={
            <>
              Deixa o arquivo maior{' '}
              {estimate ? (
                `(+${formatBytes(estimate.narrations)})`
              ) : (
                <Skeleton shape="text" width="3.5rem" height="0.875rem" className="inline-block" />
              )}
              , e evita gerar o áudio de novo depois de restaurar.
            </>
          }
        />
      </div>
      {estimate ? (
        <p className="mt-4 font-mono text-xs text-muted">arquivo estimado: {formatBytes(total)}</p>
      ) : (
        <Skeleton shape="text" width="10rem" height="0.75rem" className="mt-4" />
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          onClick={() => void backupAction.run()}
          disabled={backupAction.busy}
          aria-busy={backupAction.busy}
          className="rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-ink transition hover:brightness-110 disabled:bg-surface disabled:text-muted"
        >
          {backupAction.busy ? 'Gerando…' : 'Baixar backup'}
        </button>
        <button
          onClick={() => navigate('restore')}
          className="rounded-full border border-line px-5 py-2.5 text-sm transition hover:border-signal hover:text-signal"
        >
          Restaurar um backup
        </button>
      </div>
      {backupAction.busy && (
        <div className="mt-3 max-w-xs">
          <ProgressBar label="Gerando o backup…" done={zipPct} total={zipPct === null ? null : 100} />
        </div>
      )}
      {backupAction.error && <p className="mt-3 text-sm text-miss">{backupAction.error}</p>}
      {!backupAction.error && downloaded && <p className="mt-3 text-sm text-hit">Backup baixado.</p>}
    </Section>
  )
}
