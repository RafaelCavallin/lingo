import type JSZip from 'jszip'
import type { Card, Deck, ReviewLog } from './db'

export const BACKUP_FORMAT = 'lingo-backup'
export const BACKUP_VERSION = 3
export const MANIFEST_PATH = 'backup.json'
export const AUDIO_DIR = 'audio'

export class BackupFileInvalid extends Error {
  constructor(message = 'Este arquivo não é um backup do Lingo.') {
    super(message)
  }
}

export class BackupEmpty extends Error {
  constructor(message = 'O arquivo não contém dados para restaurar.') {
    super(message)
  }
}

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
  exportedAt: number
  accountId: string | null
  includesNarrations: boolean
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  audio: AudioEntry[]
}
export interface ParsedManifest extends Omit<BackupManifest, 'format' | 'version'> {
  discarded: number
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

export interface RestoreCounts {
  decks: number
  cards: number
  reviewLogs: number
  recordings: number
  narrations: number
}

/** O ZIP fica aberto na prévia para a aplicação ler os áudios sob demanda. */
export interface BackupSource {
  manifest: ParsedManifest
  zip: JSZip
}

export interface BackupPreview {
  exportedAt: number
  counts: RestoreCounts
  audioBytes: number
  accountMismatch: boolean
  discarded: number
  source: BackupSource
}

export interface RestoreProgress {
  phase: 'data' | 'audio'
  done: number
  total: number
}

export interface RestoreReport {
  applied: { decks: number; cards: number; reviewLogs: number; audio: number }
  tombstoned: number
  skippedStale: number
  skippedInvalid: number
  audioIncomplete: boolean
}
