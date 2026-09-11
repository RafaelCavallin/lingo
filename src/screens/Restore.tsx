import { useState } from 'react'
import { MobileNav } from '../components/MobileNav'
import { RestorePreviewCard } from '../components/RestorePreviewCard'
import { RestoreResult } from '../components/RestoreResult'
import { RestoreFilePicker } from '../components/RestoreFilePicker'
import { RestoreProgressBar } from '../components/RestoreProgressBar'
import type { BackupPreview, RestorePlan, RestoreProgress, RestoreReport } from '../services/backupRestore'

type Stage =
  | { name: 'pick' }
  | { name: 'reading' }
  | { name: 'preview'; preview: BackupPreview }
  | { name: 'applying'; progress: RestoreProgress }
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
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
      setStage({ name: 'pick' })
    }
  }

  async function run(preview: BackupPreview, choice: { plan: RestorePlan; includeNarrations: boolean }) {
    setStage({ name: 'applying', progress: { phase: 'data', done: 0, total: 0 } })
    try {
      const { restoreBackup } = await import('../services/backupRestore')
      if (choice.plan === 'replace') {
        const { downloadBackup } = await import('../services/backupExport')
        await downloadBackup({ includeNarrations: false })
      }
      const report = await restoreBackup({
        preview,
        ...choice,
        onProgress: (progress) => setStage({ name: 'applying', progress }),
      })
      setStage({ name: 'done', report })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A restauração falhou.')
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
        {stage.name === 'pick' && <RestoreFilePicker onPick={pick} />}
        {stage.name === 'reading' && <p className="font-mono text-sm text-muted">Lendo o arquivo…</p>}
        {stage.name === 'preview' && (
          <RestorePreviewCard
            preview={stage.preview}
            onCancel={onBack}
            onConfirm={(choice) => void run(stage.preview, choice)}
          />
        )}
        {stage.name === 'applying' && <RestoreProgressBar progress={stage.progress} />}
        {stage.name === 'done' && <RestoreResult report={stage.report} onBack={onBack} />}
      </main>
    </div>
  )
}
