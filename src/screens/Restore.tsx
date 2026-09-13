import { useState } from 'react'
import { errorMessageOf } from '../components/asyncAction'
import { MobileNav } from '../components/MobileNav'
import { RestorePreviewCard } from '../components/RestorePreviewCard'
import { RestoreResult } from '../components/RestoreResult'
import { RestoreFilePicker } from '../components/RestoreFilePicker'
import { RestoreProgressBar } from '../components/RestoreProgressBar'
import { Skeleton, SkeletonLines } from '../components/Skeleton'
import type { BackupPreview, RestorePlan, RestoreReport } from '../services/backupRestore'
import type { RestoreStage } from '../services/restoreProgressView'

type Stage =
  | { name: 'pick' }
  | { name: 'reading' }
  | { name: 'preview'; preview: BackupPreview }
  | { name: 'applying'; stage: RestoreStage; includesSafetyBackup: boolean }
  | { name: 'done'; report: RestoreReport }

export function Restore({ onBack }: { onBack: () => void }) {
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    setError(null)
    setStage({ name: 'reading' })
    try {
      const { readBackup } = await import('../services/backupRestore')
      setStage({ name: 'preview', preview: await readBackup(file) })
    } catch (e) {
      setError(errorMessageOf(e, 'Não foi possível ler o arquivo.'))
      setStage({ name: 'pick' })
    }
  }

  async function run(preview: BackupPreview, choice: { plan: RestorePlan; includeNarrations: boolean }) {
    const includesSafetyBackup = choice.plan === 'replace'
    const setApplying = (s: RestoreStage) => setStage({ name: 'applying', stage: s, includesSafetyBackup })
    setApplying({ step: includesSafetyBackup ? 'safety-backup' : 'data', done: null, total: null })
    try {
      const { restoreBackup } = await import('../services/backupRestore')
      if (includesSafetyBackup) {
        const { downloadBackup } = await import('../services/backupExport')
        await downloadBackup({
          includeNarrations: false,
          onProgress: (pct) => setApplying({ step: 'safety-backup', done: pct, total: 100 }),
        })
      }
      const report = await restoreBackup({
        preview,
        ...choice,
        onProgress: (progress) =>
          setApplying({ step: progress.phase, done: progress.done, total: progress.total }),
      })
      setStage({ name: 'done', report })
    } catch (e) {
      setError(errorMessageOf(e, 'A restauração falhou.'))
      setStage({ name: 'preview', preview })
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-14 pt-6">
      <header className="flex items-center justify-between font-mono text-xs text-muted">
        <button onClick={onBack} className="hover:text-text">← Início</button>
        <MobileNav />
      </header>
      <main className="flex-1 py-8">
        {error && <p className="mb-6 text-sm text-miss">{error}</p>}
        {stage.name === 'pick' && <RestoreFilePicker onPick={(f) => void pick(f)} />}
        {stage.name === 'reading' && (
          <div>
            <p role="status" aria-live="polite" className="sr-only">
              Lendo o arquivo…
            </p>
            <Skeleton shape="text" width="12rem" height="2rem" />
            <div className="mt-4">
              <SkeletonLines lines={2} lineHeight="0.875rem" />
            </div>
            <Skeleton shape="block" height="9rem" className="mt-8" />
          </div>
        )}
        {stage.name === 'preview' && (
          <RestorePreviewCard
            preview={stage.preview}
            onCancel={onBack}
            onConfirm={(choice) => void run(stage.preview, choice)}
          />
        )}
        {stage.name === 'applying' && (
          <RestoreProgressBar stage={stage.stage} includesSafetyBackup={stage.includesSafetyBackup} />
        )}
        {stage.name === 'done' && <RestoreResult report={stage.report} onBack={onBack} />}
      </main>
    </div>
  )
}
