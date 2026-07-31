import Dexie, { type EntityTable } from 'dexie'
import { State } from 'ts-fsrs'

export type HintType = 'phrasal_verb' | 'false_cognate' | 'pronunciation' | 'custom'

export interface Hint {
  type: HintType
  text: string
  source: 'ai' | 'user'
}

export interface Deck {
  id: string
  name: string
  createdAt: number
  newCardsPerDay: number
  youngLimit: number
  updatedAt: number
  listenFirst: boolean
  voice: string
  /** Velocidade da narração automática (1 = velocidade natural da voz). */
  speechRate: number
  /** Parâmetros do FSRS otimizados sobre o histórico real. Vazio = padrão. */
  fsrsParams?: number[]
  paramsOptimizedAt?: number
}

export interface Card {
  id: string
  deckId: string
  sentence: string
  translation: string
  hints: Hint[]
  clozeRanges?: { start: number; end: number }[]
  // Estado FSRS — sempre escrito pelo scheduler, nunca à mão.
  due: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: State
  lastReview?: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface ReviewLog {
  id: string
  cardId: string
  rating: 'again' | 'good'
  reviewedAt: number
  stateBefore: State
  scheduledDays: number
  durationMs: number
}

export interface AudioBlob {
  id: string
  cardId: string
  kind: 'tts' | 'tts_slow' | 'user_recording'
  blob: Blob
  createdAt: number
  /** Voz usada na narração: trocar de voz invalida o cache. */
  voice?: string
}

export const db = new Dexie('lingo') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  reviewLogs: EntityTable<ReviewLog, 'id'>
  audioBlobs: EntityTable<AudioBlob, 'id'>
}

db.version(1).stores({
  decks: 'id, name, createdAt',
  cards: 'id, deckId, due, state, createdAt',
  reviewLogs: 'id, cardId, reviewedAt',
  audioBlobs: 'id, cardId, kind',
})

db.version(2)
  .stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, state, createdAt, updatedAt',
    reviewLogs: 'id, cardId, reviewedAt',
    audioBlobs: 'id, cardId, kind, voice',
  })
  .upgrade(async (tx) => {
    const now = Date.now()
    await tx.table('cards').toCollection().modify((c) => {
      c.updatedAt ??= c.lastReview ?? c.createdAt ?? now
    })
    await tx.table('decks').toCollection().modify((d) => {
      d.updatedAt ??= now
      d.listenFirst ??= false
      d.voice ??= DEFAULT_VOICE
    })
  })

db.version(3)
  .stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, state, createdAt, updatedAt',
    reviewLogs: 'id, cardId, reviewedAt',
    audioBlobs: 'id, cardId, kind, voice',
  })
  .upgrade(async (tx) => {
    await tx.table('decks').toCollection().modify((d) => {
      d.speechRate ??= DEFAULT_RATE
    })
  })

export const DEFAULT_VOICE = 'nova'
export const DEFAULT_RATE = 1
/** Abaixo de 0,6 a fala perde a prosódia e atrapalha mais do que ajuda. */
export const MIN_RATE = 0.6
export const MAX_RATE = 1.2
export const VOICES = [
  { id: 'nova', label: 'Nova', note: 'feminina, clara' },
  { id: 'alloy', label: 'Alloy', note: 'neutra, equilibrada' },
  { id: 'shimmer', label: 'Shimmer', note: 'feminina, suave' },
  { id: 'onyx', label: 'Onyx', note: 'masculina, grave' },
]

export const uid = () => crypto.randomUUID()

/** Baralho padrão na primeira abertura, para o app nunca abrir vazio de estrutura. */
export async function ensureDefaultDeck(): Promise<Deck> {
  const existing = await db.decks.toCollection().first()
  if (existing) return existing
  const deck: Deck = {
    id: uid(),
    name: 'Frases em inglês',
    createdAt: Date.now(),
    newCardsPerDay: 20,
    youngLimit: 50,
    updatedAt: Date.now(),
    listenFirst: false,
    voice: DEFAULT_VOICE,
    speechRate: DEFAULT_RATE,
  }
  await db.decks.add(deck)
  return deck
}

/** Backup exportável desde a Fase 1 (mitigação de risco: IndexedDB pode ser apagado). */
export async function exportBackup(): Promise<Blob> {
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ])
  const payload = { version: 1, exportedAt: Date.now(), decks, cards, reviewLogs }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
