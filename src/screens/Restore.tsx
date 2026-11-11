import { useState } from 'react'
import { errorMessageOf } from '../components/asyncAction'
import { MobileNav } from '../components/MobileNav'
import { RestoreError } from '../components/RestoreError'
import { RestorePreviewCard } from '../components/RestorePreviewCard'
import { RestoreResult } from '../components/RestoreResult'
import { RestoreFilePicker } from '../components/RestoreFilePicker'
import { RestoreProgressBar } from '../components/RestoreProgressBar'
import { Skeleton, SkeletonLines } from '../components/Skeleton'
import type { BackupPreview } from '../services/backupTypes'
import { wantsSafetyCopy, type RestoreChoice } from '../services/restoreChoice'
import type { RestoreStage } from '../services/restoreProgressView'
import type { RestoreOutcome } from '../services/restoreRun'

type Stage =
  | { name: 'pick' }
  | { name: 'reading' }
  | { name: 'preview'; preview: BackupPreview }
  | { name: 'applying'; stage: RestoreStage; includesSafetyBackup: boolean }
  | ({ name: 'done' } & RestoreOutcome)

export function Restore({ onBack }: { onBack: () => void }) {
  const [stage, setStage] = useState<Stage>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    setError(null)
    setStage({ name: 'reading' })
    try {
      const { readBackup } = await import('../services/backupPreview')
      setStage({ name: 'preview', preview: await readBackup(file) })
    } catch (e) {
      setError(errorMessageOf(e, 'Não foi possível ler o arquivo.'))
      setStage({ name: 'pick' })
    }
  }

  async function run(preview: BackupPreview, choice: RestoreChoice) {
    setError(null)
    const includesSafetyBackup = wantsSafetyCopy(choice)
    const setApplying = (s: RestoreStage) => setStage({ name: 'applying', stage: s, includesSafetyBackup })
    setApplying({ step: includesSafetyBackup ? 'safety-backup' : 'data', done: null, total: null })
    try {
      const { runRestore } = await import('../services/restoreRun')
      setStage({ name: 'done', ...(await runRestore({ preview, choice, onStage: setApplying })) })
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
        {error && <RestoreError message={error} />}
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
        {stage.name === 'done' && (
          <RestoreResult report={stage.report} safetyFileName={stage.safetyFileName} onBack={onBack} />
        )}
      </main>
    </div>
  )
}
