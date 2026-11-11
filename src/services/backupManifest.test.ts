import { describe, expect, it } from 'vitest'
import { BackupFileInvalid, BackupFormatTooOld, BackupVersionTooNew } from './backupErrors'
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
    appVersion: '1.0.0+a1b2c3d',
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
      formatVersion: 4,
      convertedFrom: null,
      appVersion: '1.0.0+a1b2c3d',
      exportedAt: 1788000000000,
      accountId: null,
      includesNarrations: false,
      decks: [makeDeck()],
      cards: [makeCard()],
      reviewLogs: [makeLog()],
      audio: [makeAudio()],
      discarded: 0,
      unknownValues: 0,
    })
  })

  it('rejeita manifesto sem o campo format', () => {
    const raw = makeManifest()
    delete (raw as Record<string, unknown>).format

    expect(() => parseManifest(raw)).toThrow(BackupFileInvalid)
  })

  it('rejeita manifesto de outro formato', () => {
    expect(() => parseManifest(makeManifest({ format: 'anki-backup' }))).toThrow(BackupFileInvalid)
  })

  it('rejeita como formato antigo o manifesto de duas versões atrás', () => {
    expect(() => parseManifest(makeManifest({ version: BACKUP_VERSION - 2 }))).toThrow(BackupFormatTooOld)
  })

  it('rejeita como mais novo o manifesto de versão acima da atual', () => {
    expect(() => parseManifest(makeManifest({ version: BACKUP_VERSION + 1 }))).toThrow(BackupVersionTooNew)
  })

  it('rejeita o que não é um objeto de manifesto', () => {
    expect(() => parseManifest(null)).toThrow(BackupFileInvalid)
    expect(() => parseManifest('backup')).toThrow(BackupFileInvalid)
  })

  it('rejeita o manifesto da versão atual sem os campos obrigatórios do envelope', () => {
    const raw = makeManifest()
    delete (raw as Record<string, unknown>).decks

    expect(() => parseManifest(raw)).toThrow(BackupFileInvalid)
  })

  it('converte o manifesto da versão anterior sem tocar nos registros', () => {
    const v3 = makeManifest({ version: BACKUP_VERSION - 1 })
    delete (v3 as Record<string, unknown>).appVersion

    const parsed = parseManifest(v3)

    expect(parsed.formatVersion).toBe(BACKUP_VERSION - 1)
    expect(parsed.convertedFrom).toBe(BACKUP_VERSION - 1)
    expect(parsed.appVersion).toBeNull()
    expect(parsed.cards).toEqual([makeCard()])
    expect(parsed.reviewLogs).toEqual([makeLog()])
    expect(parsed.discarded).toBe(0)
  })

  it('aceita cartão com dica do tipo idiom', () => {
    const hints: Card['hints'] = [{ type: 'idiom', text: 'break the ice = quebrar o gelo', source: 'user' }]

    const parsed = parseManifest(makeManifest({ cards: [makeCard({ hints })] }))

    expect(parsed?.cards[0].hints).toEqual(hints)
    expect(parsed?.discarded).toBe(0)
  })

  it('descarta cartão com tipo de dica desconhecido', () => {
    const raw = makeManifest({ cards: [makeCard({ hints: [{ type: 'slang', text: 'x', source: 'user' } as never] })] })

    expect(parseManifest(raw)?.discarded).toBe(1)
  })

  it('conta como valor desconhecido o cartão com tipo de dica fora da lista', () => {
    const raw = makeManifest({ cards: [makeCard({ hints: [{ type: 'slang', text: 'x', source: 'user' } as never] })] })

    const parsed = parseManifest(raw)

    expect(parsed.discarded).toBe(1)
    expect(parsed.unknownValues).toBe(1)
  })

  it('não conta como valor desconhecido o cartão sem campo obrigatório', () => {
    const raw = makeManifest({ cards: [makeCard(), { id: 'c2', deckId: 'd1' }] })

    const parsed = parseManifest(raw)

    expect(parsed.discarded).toBe(1)
    expect(parsed.unknownValues).toBe(0)
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

  it.each([[21], [19], [17]])('preserva um vetor de %s parâmetros do FSRS ao ler o arquivo', (length) => {
    const parameters = Array.from({ length }, (_, i) => 0.3 + i / 10)
    const raw = makeManifest({ decks: [{ ...makeDeck(), fsrsParams: parameters, paramsOptimizedAt: 7000 }] })

    const parsed = parseManifest(raw)

    expect(parsed?.decks[0].fsrsParams).toEqual(parameters)
    expect(parsed?.decks[0].paramsOptimizedAt).toBe(7000)
  })

  it('preserva a conta gravada no arquivo', () => {
    const parsed = parseManifest(makeManifest({ accountId: 'user-1' }))

    expect(parsed?.accountId).toBe('user-1')
  })
})
