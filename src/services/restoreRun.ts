import { downloadBackup } from './backupExport'
import { restoreBackup } from './backupRestore'
import type { BackupPreview, RestoreReport } from './backupTypes'
import { wantsSafetyCopy, type RestoreChoice } from './restoreChoice'
import type { RestoreStage } from './restoreProgressView'

export interface RestoreOutcome {
  report: RestoreReport
  safetyFileName: string | null
}

const PERCENT_TOTAL = 100

async function saveSafetyCopy(onStage: (stage: RestoreStage) => void): Promise<string> {
  onStage({ step: 'safety-backup', done: null, total: null })
  return downloadBackup({
    includeNarrations: false,
    kind: 'safety',
    onProgress: (percent) => onStage({ step: 'safety-backup', done: percent, total: PERCENT_TOTAL }),
  })
}

/** A cópia vem antes de qualquer escrita: se ela falhar, nada é restaurado. */
export async function runRestore(input: {
  preview: BackupPreview
  choice: RestoreChoice
  onStage: (stage: RestoreStage) => void
}): Promise<RestoreOutcome> {
  const { preview, choice, onStage } = input
  const safetyFileName = wantsSafetyCopy(choice) ? await saveSafetyCopy(onStage) : null
  const report = await restoreBackup({
    preview,
    plan: choice.plan,
    includeNarrations: choice.includeNarrations,
    skipDuplicates: choice.skipDuplicates,
    onProgress: ({ phase, done, total }) => onStage({ step: phase, done, total }),
  })
  return { report, safetyFileName }
}
