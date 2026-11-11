import type { Card, Deck, ReviewLog } from './db'

export const BACKUP_FORMAT = 'lingo-backup'
export const BACKUP_VERSION = 4
export const PREVIOUS_BACKUP_VERSION = 3
export const MANIFEST_PATH = 'backup.json'
export const AUDIO_DIR = 'audio'

/** Índice de um áudio dentro do ZIP. `sentence` é a frase do cartão no momento
 *  da geração: é o que permite descartar narração que ficou obsoleta. */
export interface AudioEntry {
  id: string
  cardId: string
  kind: 'tts' | 'user_recording'
  voice: string | null
  createdAt: number
  mimeType: string
  bytes: number
  sentence: string
  path: string
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  appVersion: string | null
  exportedAt: number
  accountId: string | null
  includesNarrations: boolean
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  audio: AudioEntry[]
}
export interface ParsedManifest extends Omit<BackupManifest, 'format' | 'version'> {
  formatVersion: number
  convertedFrom: number | null
  discarded: number
  unknownValues: number
}

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
}

export function audioFileName(id: string, mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  return `${AUDIO_DIR}/${id}.${MIME_EXTENSIONS[base] ?? 'bin'}`
}
