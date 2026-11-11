import type JSZip from 'jszip'
import type { ParsedManifest } from './backupFormat'
import type { Card, Deck, ReviewLog } from './db'

export type RestorePlan = 'merge' | 'replace'

export interface RestoreContent {
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
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

export interface DuplicateSummary {
  cardIds: string[]
  items: { sentence: string; deckName: string }[]
}

export interface BackupPreview {
  exportedAt: number
  counts: RestoreCounts
  audioBytes: number
  accountMismatch: boolean
  discarded: number
  unknownValues: number
  formatVersion: number
  convertedFrom: number | null
  appVersion: string | null
  duplicates: DuplicateSummary
  hasLocalData: boolean
  boundToAccount: boolean
  source: BackupSource
}

export interface RestoreProgress {
  phase: 'data' | 'audio'
  done: number
  total: number
}

export interface DuplicateReport {
  cards: number
  reviewLogs: number
  audio: number
  skipped: boolean
}

export interface RestoreReport {
  plan: RestorePlan
  boundToAccount: boolean
  duplicates: DuplicateReport
  applied: { decks: number; cards: number; reviewLogs: number; audio: number }
  tombstoned: number
  skippedStale: number
  skippedInvalid: number
  audioIncomplete: boolean
}
