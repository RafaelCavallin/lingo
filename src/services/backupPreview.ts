import JSZip from 'jszip'
import { getBoundUserId } from './auth'
import { BackupEmpty, BackupError, BackupFileInvalid, BackupFormatTooOld } from './backupErrors'
import { summarizeDuplicates } from './backupDuplicates'
import { MANIFEST_PATH, type ParsedManifest } from './backupFormat'
import { hasLocalData } from './backupLocalData'
import { parseManifest } from './backupManifest'
import { isLegacyJsonBackup } from './backupVersion'
import type { BackupPreview, BackupSource, RestoreCounts } from './backupTypes'

function toCounts(manifest: ParsedManifest): RestoreCounts {
  return {
    decks: manifest.decks.filter((deck) => deck.deletedAt === 0).length,
    cards: manifest.cards.filter((card) => card.deletedAt === 0).length,
    reviewLogs: manifest.reviewLogs.length,
    recordings: manifest.audio.filter((entry) => entry.kind === 'user_recording').length,
    narrations: manifest.audio.filter((entry) => entry.kind === 'tts').length,
  }
}

const MAX_LEGACY_JSON_BYTES = 50 * 1024 * 1024

async function isLegacyJsonFile(file: Blob): Promise<boolean> {
  if (file.size > MAX_LEGACY_JSON_BYTES) return false
  try {
    return isLegacyJsonBackup(JSON.parse(new TextDecoder().decode(await file.arrayBuffer())) as unknown)
  } catch {
    return false
  }
}

async function openZip(file: Blob): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw (await isLegacyJsonFile(file)) ? new BackupFormatTooOld() : new BackupFileInvalid()
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BackupFileInvalid()
  }
}

async function openManifest(file: Blob): Promise<BackupSource> {
  try {
    const zip = await openZip(file)
    const entry = zip.file(MANIFEST_PATH)
    if (!entry) throw new BackupFileInvalid()
    return { manifest: parseManifest(parseJson(await entry.async('string'))), zip }
  } catch (e) {
    if (e instanceof BackupError) throw e
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
    unknownValues: manifest.unknownValues,
    formatVersion: manifest.formatVersion,
    convertedFrom: manifest.convertedFrom,
    appVersion: manifest.appVersion,
    duplicates: await summarizeDuplicates(manifest.cards),
    hasLocalData: await hasLocalData(),
    boundToAccount: bound !== null,
    source,
  }
}
