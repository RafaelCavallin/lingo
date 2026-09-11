import JSZip from 'jszip'
import { getBoundUserId } from './auth'
import { applyRecords, type RestorePlan } from './backupApply'
import { restoreAudio } from './backupAudioRestore'
import {
  BackupEmpty,
  BackupFileInvalid,
  MANIFEST_PATH,
  type BackupPreview,
  type BackupSource,
  type ParsedManifest,
  type RestoreCounts,
  type RestoreProgress,
  type RestoreReport,
} from './backupFormat'
import { parseManifest } from './backupManifest'

export type { RestorePlan }
export type { BackupPreview, BackupSource, RestoreCounts, RestoreProgress, RestoreReport }

export interface RestoreInput {
  preview: BackupPreview
  plan: RestorePlan
  includeNarrations: boolean
  onProgress?: (progress: RestoreProgress) => void
}

function toCounts(manifest: ParsedManifest): RestoreCounts {
  return {
    decks: manifest.decks.filter((deck) => deck.deletedAt === 0).length,
    cards: manifest.cards.filter((card) => card.deletedAt === 0).length,
    reviewLogs: manifest.reviewLogs.length,
    recordings: manifest.audio.filter((entry) => entry.kind === 'user_recording').length,
    narrations: manifest.audio.filter((entry) => entry.kind === 'tts').length,
  }
}

async function openManifest(file: Blob): Promise<BackupSource> {
  try {
    const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()))
    const entry = zip.file(MANIFEST_PATH)
    if (!entry) throw new BackupFileInvalid()
    const manifest = parseManifest(JSON.parse(await entry.async('string')) as unknown)
    if (!manifest) throw new BackupFileInvalid()
    return { manifest, zip }
  } catch (e) {
    if (e instanceof BackupFileInvalid) throw e
    throw new BackupFileInvalid()
  }
}

/** Não escreve nada: a prévia existe justamente para o usuário conferir antes. */
export async function readBackup(file: Blob): Promise<BackupPreview> {
  const source = await openManifest(file)
  const { manifest } = source
  if (manifest.decks.length === 0 && manifest.cards.length === 0 && manifest.reviewLogs.length === 0) {
    throw new BackupEmpty()
  }
  const bound = await getBoundUserId()
  return {
    exportedAt: manifest.exportedAt,
    counts: toCounts(manifest),
    audioBytes: manifest.audio.reduce((total, entry) => total + entry.bytes, 0),
    accountMismatch: bound !== null && manifest.accountId !== null && bound !== manifest.accountId,
    discarded: manifest.discarded,
    source,
  }
}

/** O áudio vem depois, e fora da transação dos dados: a recuperação do estudo
 *  não pode depender de haver espaço no navegador para os blobs. */
export async function restoreBackup(input: RestoreInput): Promise<RestoreReport> {
  const { manifest, zip } = input.preview.source
  const records = manifest.decks.length + manifest.cards.length + manifest.reviewLogs.length
  const applied = await applyRecords(manifest, input.plan)
  input.onProgress?.({ phase: 'data', done: records, total: records })
  const audio = await restoreAudio({
    zip,
    entries: manifest.audio,
    includeNarrations: input.includeNarrations,
    onProgress: (done, total) => input.onProgress?.({ phase: 'audio', done, total }),
  })
  return {
    applied: {
      decks: applied.decks,
      cards: applied.cards,
      reviewLogs: applied.reviewLogs,
      audio: audio.applied,
    },
    tombstoned: applied.tombstoned,
    skippedStale: audio.stale,
    skippedInvalid: input.preview.discarded,
    audioIncomplete: audio.incomplete,
  }
}
