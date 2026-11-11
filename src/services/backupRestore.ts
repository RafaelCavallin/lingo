import { applyRecords, type AppliedRecords } from './backupApply'
import { restoreAudio, type AudioRestoreResult } from './backupAudioRestore'
import type { ParsedManifest } from './backupFormat'
import type { BackupPreview, RestorePlan, RestoreProgress, RestoreReport } from './backupTypes'

export interface RestoreInput {
  preview: BackupPreview
  plan: RestorePlan
  includeNarrations: boolean
  skipDuplicates?: boolean
  onProgress?: (progress: RestoreProgress) => void
}

interface ReportInput {
  input: RestoreInput
  applied: AppliedRecords
  audio: AudioRestoreResult
  skippedIds: Set<string>
}

function countRecords(manifest: ParsedManifest): number {
  return manifest.decks.length + manifest.cards.length + manifest.reviewLogs.length
}

function announceTotalBeforeSingleTransaction(input: RestoreInput): void {
  const total = countRecords(input.preview.source.manifest)
  input.onProgress?.({ phase: 'data', done: 0, total })
}

async function restoreAudioExcept(input: RestoreInput, skippedIds: Set<string>): Promise<AudioRestoreResult> {
  const { manifest, zip } = input.preview.source
  return restoreAudio({
    zip,
    entries: manifest.audio.filter((entry) => !skippedIds.has(entry.cardId)),
    includeNarrations: input.includeNarrations,
    onProgress: (done, total) => input.onProgress?.({ phase: 'audio', done, total }),
  })
}

function countSkippedAudio({ input, skippedIds }: ReportInput): number {
  const { audio } = input.preview.source.manifest
  return audio.filter(
    (entry) => skippedIds.has(entry.cardId) && (input.includeNarrations || entry.kind === 'user_recording'),
  ).length
}

function buildReport(report: ReportInput): RestoreReport {
  const { input, applied, audio } = report
  return {
    plan: input.plan,
    boundToAccount: input.preview.boundToAccount,
    duplicates: {
      cards: applied.duplicateCardIds.length,
      reviewLogs: applied.skippedLogs,
      audio: countSkippedAudio(report),
      skipped: input.skipDuplicates ?? false,
    },
    applied: { decks: applied.decks, cards: applied.cards, reviewLogs: applied.reviewLogs, audio: audio.applied },
    tombstoned: applied.tombstoned,
    skippedStale: audio.stale,
    skippedInvalid: input.preview.discarded,
    audioIncomplete: audio.incomplete,
  }
}

/** O áudio vem depois, e fora da transação dos dados: a recuperação do estudo
 *  não pode depender de haver espaço no navegador para os blobs. */
export async function restoreBackup(input: RestoreInput): Promise<RestoreReport> {
  const { manifest } = input.preview.source
  const skipDuplicates = input.skipDuplicates ?? false
  announceTotalBeforeSingleTransaction(input)
  const applied = await applyRecords(manifest, { plan: input.plan, skipDuplicates })
  const skippedIds = new Set(skipDuplicates ? applied.duplicateCardIds : [])
  const audio = await restoreAudioExcept(input, skippedIds)
  return buildReport({ input, applied, audio, skippedIds })
}
