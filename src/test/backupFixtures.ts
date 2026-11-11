import JSZip from 'jszip'
import { createBackup } from '../services/backupExport'
import { db, type Card, type Deck, type ReviewLog } from '../services/db'
import { resetDb } from './dbHelpers'

export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Inglês',
    createdAt: 1000,
    newCardsPerDay: 20,
    youngLimit: 50,
    updatedAt: 1000,
    listenFirst: false,
    voice: 'nova',
    speechRate: 1,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    sentence: 'I gave up',
    translation: 'Eu desisti',
    hints: [],
    due: 2000,
    stability: 3.5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 3,
    lapses: 1,
    state: 2,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

export function makeLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: 'l1',
    cardId: 'c1',
    deckId: 'd1',
    rating: 'good',
    reviewedAt: 1500,
    stateBefore: 1,
    scheduledDays: 1,
    durationMs: 4200,
    dirty: 0,
    ...overrides,
  }
}

export interface BackupContent {
  decks?: Deck[]
  cards?: Card[]
  reviewLogs?: ReviewLog[]
  recordings?: { id: string; cardId: string }[]
}

/** Gera um arquivo a partir de um estado e devolve o banco ao estado vazio. */
export async function backupOf(content: BackupContent): Promise<Blob> {
  await resetDb()
  await db.decks.bulkAdd(content.decks ?? [])
  await db.cards.bulkAdd(content.cards ?? [])
  await db.reviewLogs.bulkAdd(content.reviewLogs ?? [])
  await seedRecordings(content.recordings ?? [])
  const file = await createBackup({ includeNarrations: false })
  await resetDb()
  return file
}

export async function seedRecordings(recordings: { id: string; cardId: string }[]): Promise<void> {
  await db.audioBlobs.bulkAdd(
    recordings.map(({ id, cardId }) => ({
      id,
      cardId,
      kind: 'user_recording' as const,
      blob: new Blob([id], { type: 'audio/webm' }),
      createdAt: 1200,
    })),
  )
}

/** Monta à mão um ZIP com o `backup.json` dado — para simular versões e formatos que o app atual não gera. */
export async function zipWithManifest(manifest: unknown): Promise<Blob> {
  const zip = new JSZip()
  zip.file('backup.json', typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  return zip.generateAsync({ type: 'blob' })
}

export function manifestV3(content: Pick<Required<BackupContent>, 'decks' | 'cards' | 'reviewLogs'>): Record<string, unknown> {
  return {
    format: 'lingo-backup',
    version: 3,
    exportedAt: 1788000000000,
    accountId: null,
    includesNarrations: false,
    decks: content.decks,
    cards: content.cards,
    reviewLogs: content.reviewLogs,
    audio: [],
  }
}
