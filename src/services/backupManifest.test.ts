import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, type AudioEntry } from './backupFormat'
import { parseManifest } from './backupManifest'
import type { Card, Deck, ReviewLog } from './db'

function makeDeck(overrides: Partial<Deck> = {}): Deck {
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

function makeCard(overrides: Partial<Card> = {}): Card {
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

function makeLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
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

function makeAudio(overrides: Partial<AudioEntry> = {}): AudioEntry {
  return {
    id: 'a1',
    cardId: 'c1',
    kind: 'user_recording',
    voice: null,
    createdAt: 1200,
    mimeType: 'audio/webm',
    bytes: 1024,
    sentence: 'I gave up',
    path: 'audio/a1.webm',
    ...overrides,
  }
}

function makeManifest(overrides: Record<string, unknown> = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 1788000000000,
    accountId: null,
    includesNarrations: false,
    decks: [makeDeck()],
    cards: [makeCard()],
    reviewLogs: [makeLog()],
    audio: [makeAudio()],
    ...overrides,
  }
}

describe('parseManifest', () => {
  it('devolve o conteúdo do manifesto válido sem descartar nada', () => {
    const parsed = parseManifest(makeManifest())

    expect(parsed).toEqual({
      exportedAt: 1788000000000,
      accountId: null,
      includesNarrations: false,
      decks: [makeDeck()],
      cards: [makeCard()],
      reviewLogs: [makeLog()],
      audio: [makeAudio()],
      discarded: 0,
    })
  })

  it('rejeita manifesto sem o campo format', () => {
    const raw = makeManifest()
    delete (raw as Record<string, unknown>).format

    expect(parseManifest(raw)).toBeNull()
  })

  it('rejeita manifesto de outro formato', () => {
    expect(parseManifest(makeManifest({ format: 'anki-backup' }))).toBeNull()
  })

  it('rejeita manifesto de versão desconhecida', () => {
    expect(parseManifest(makeManifest({ version: 2 }))).toBeNull()
  })

  it('rejeita o que não é um objeto de manifesto', () => {
    expect(parseManifest(null)).toBeNull()
    expect(parseManifest('backup')).toBeNull()
  })

  it('descarta cartão malformado sem invalidar o manifesto inteiro', () => {
    const raw = makeManifest({
      cards: [makeCard(), { id: 'c2', deckId: 'd1' }, makeCard({ id: 'c3' })],
    })

    const parsed = parseManifest(raw)

    expect(parsed?.cards.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(parsed?.discarded).toBe(1)
  })

  it('conta os descartados de todas as coleções do arquivo', () => {
    const raw = makeManifest({
      decks: [{ id: 'd9' }],
      reviewLogs: [makeLog(), { id: 'l9' }],
      audio: [makeAudio({ kind: 'tts_slow' as AudioEntry['kind'] })],
    })

    const parsed = parseManifest(raw)

    expect(parsed?.discarded).toBe(3)
    expect(parsed?.decks).toEqual([])
    expect(parsed?.audio).toEqual([])
  })

  it('ignora o dirty gravado no arquivo e devolve tudo como não pendente', () => {
    const raw = makeManifest({
      decks: [{ ...makeDeck(), dirty: 1 }],
      cards: [{ ...makeCard(), dirty: 1 }],
      reviewLogs: [{ ...makeLog(), dirty: 1 }],
    })

    const parsed = parseManifest(raw)

    expect(parsed?.decks[0].dirty).toBe(0)
    expect(parsed?.cards[0].dirty).toBe(0)
    expect(parsed?.reviewLogs[0].dirty).toBe(0)
  })

  it('preserva os registros excluídos que o backup carrega', () => {
    const raw = makeManifest({ cards: [makeCard({ deletedAt: 1700 })] })

    const parsed = parseManifest(raw)

    expect(parsed?.cards[0].deletedAt).toBe(1700)
  })

  it('normaliza para ausente os campos opcionais nulos do arquivo', () => {
    const raw = makeManifest({
      decks: [{ ...makeDeck(), fsrsParams: null, paramsOptimizedAt: null }],
      cards: [{ ...makeCard(), phonetic: null, clozeRanges: null, lastReview: null }],
    })

    const parsed = parseManifest(raw)

    expect(parsed?.decks[0]).not.toHaveProperty('fsrsParams', null)
    expect(parsed?.decks[0].fsrsParams).toBeUndefined()
    expect(parsed?.cards[0].phonetic).toBeUndefined()
    expect(parsed?.cards[0].lastReview).toBeUndefined()
  })

  it('preserva a conta gravada no arquivo', () => {
    const parsed = parseManifest(makeManifest({ accountId: 'user-1' }))

    expect(parsed?.accountId).toBe('user-1')
  })
})
