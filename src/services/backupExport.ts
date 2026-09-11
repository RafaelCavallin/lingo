import JSZip from 'jszip'
import { getBoundUserId } from './auth'
import { selectAudio } from './backupAudio'
import { collectRecords } from './backupRecords'
import { BACKUP_FORMAT, BACKUP_VERSION, MANIFEST_PATH, type BackupManifest } from './backupFormat'

export interface BackupOptions {
  includeNarrations: boolean
}

export async function createBackup({ includeNarrations }: BackupOptions): Promise<Blob> {
  const records = await collectRecords()
  const audio = await selectAudio(records.cards, includeNarrations)
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    accountId: await getBoundUserId(),
    includesNarrations: includeNarrations,
    ...records,
    audio: audio.map((a) => a.entry),
  }
  const zip = new JSZip()
  zip.file(MANIFEST_PATH, JSON.stringify(manifest), { compression: 'DEFLATE' })
  for (const { entry, blob } of audio) {
    zip.file(entry.path, new Uint8Array(await blob.arrayBuffer()), { compression: 'STORE' })
  }
  return zip.generateAsync({ type: 'blob' })
}

export async function downloadBackup(options: BackupOptions): Promise<void> {
  const url = URL.createObjectURL(await createBackup(options))
  const a = document.createElement('a')
  a.href = url
  a.download = `lingo-backup-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
