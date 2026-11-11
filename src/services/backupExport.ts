import JSZip from 'jszip'
import { APP_VERSION } from './appVersion'
import { getBoundUserId } from './auth'
import { selectAudio } from './backupAudio'
import { collectRecords } from './backupRecords'
import { BACKUP_FORMAT, BACKUP_VERSION, MANIFEST_PATH, type BackupManifest } from './backupFormat'

export interface BackupOptions {
  includeNarrations: boolean
  /** Percentual (0–100) da compressão do ZIP — a única etapa aqui que o
   *  JSZip sabe medir; coletar os registros e ler os blobs de áudio não tem
   *  progresso granular. */
  onProgress?: (percent: number) => void
}

export async function createBackup({ includeNarrations, onProgress }: BackupOptions): Promise<Blob> {
  const records = await collectRecords()
  const audio = await selectAudio(records.cards, includeNarrations)
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
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
  return zip.generateAsync({ type: 'blob' }, (meta) => onProgress?.(meta.percent))
}

export type BackupKind = 'manual' | 'safety'

const FILE_PREFIX: Record<BackupKind, string> = {
  manual: 'lingo-backup',
  safety: 'lingo-antes-de-restaurar',
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** A data é a do relógio do usuário: `toISOString` usaria UTC e, à noite no
 *  Brasil, nomearia o arquivo com o dia seguinte. */
export function backupFileName({ kind, now }: { kind: BackupKind; now: Date }): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${FILE_PREFIX[kind]}-${date}.zip`
}

export async function downloadBackup({
  kind = 'manual',
  ...options
}: BackupOptions & { kind?: BackupKind }): Promise<string> {
  const fileName = backupFileName({ kind, now: new Date() })
  const url = URL.createObjectURL(await createBackup(options))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return fileName
}
