import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DECK_NAME,
  db,
  deleteCard,
  deleteDeck,
  downloadBackup,
  ensureDefaultDeck,
  exportBackup,
  liveCards,
  updateCard,
  type AudioBlob,
  type Card,
  type Deck,
  type ReviewLog,
} from './db'
import { resetDb, stubObjectUrl } from '../test/dbHelpers'

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
    id: overrides.id ?? 'c1',
    deckId: 'd1',
    sentence: 'Hello there',
    translation: 'Olá',
    hints: [],
    due: 1000,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 3,
    lapses: 1,
    state: 2,
    lastReview: 900,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

function makeBlob(overrides: Partial<AudioBlob> = {}): AudioBlob {
  return {
    id: overrides.id ?? 'a1',
    cardId: 'c1',
    kind: 'tts',
    blob: new Blob(['x']),
    createdAt: 1000,
    voice: 'nova',
    ...overrides,
  }
}

let restoreObjectUrl = () => {}

afterEach(async () => {
  restoreObjectUrl()
  restoreObjectUrl = () => {}
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await resetDb()
})

describe('updateCard', () => {
  it('atualiza conteúdo, updatedAt e marca dirty', async () => {
    await db.cards.add(makeCard())
    await updateCard('c1', {
      sentence: 'General Kenobi',
      translation: 'General Kenobi (pt)',
      hints: [{ type: 'custom', text: 'nota', source: 'user' }],
      clozeRanges: [{ start: 0, end: 7 }],
    })
    const card = (await db.cards.get('c1'))!
    expect(card.sentence).toBe('General Kenobi')
    expect(card.translation).toBe('General Kenobi (pt)')
    expect(card.hints).toEqual([{ type: 'custom', text: 'nota', source: 'user' }])
    expect(card.clozeRanges).toEqual([{ start: 0, end: 7 }])
    expect(card.updatedAt).toBeGreaterThan(1000)
    expect(card.dirty).toBe(1)
  })

  it('não toca no estado FSRS nem cria reviewLog', async () => {
    const before = makeCard()
    await db.cards.add(before)
    await updateCard('c1', { sentence: 'Edited', translation: 'Editada', hints: [] })
    const after = (await db.cards.get('c1'))!
    const fsrs = (c: Card) => ({
      due: c.due,
      stability: c.stability,
      difficulty: c.difficulty,
      elapsedDays: c.elapsedDays,
      scheduledDays: c.scheduledDays,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state,
      lastReview: c.lastReview,
    })
    expect(fsrs(after)).toEqual(fsrs(before))
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('apaga os áudios do card quando a frase muda', async () => {
    await db.cards.add(makeCard())
    await db.audioBlobs.bulkAdd([
      makeBlob({ id: 'a1', kind: 'tts' }),
      makeBlob({ id: 'a2', kind: 'user_recording' }),
      makeBlob({ id: 'a3', cardId: 'c2' }),
    ])
    await updateCard('c1', { sentence: 'New sentence', translation: 'Olá', hints: [] })
    expect(await db.audioBlobs.where('cardId').equals('c1').count()).toBe(0)
    // Áudio de outro card fica intacto.
    expect(await db.audioBlobs.where('cardId').equals('c2').count()).toBe(1)
  })

  it('preserva os áudios quando só tradução/dicas mudam', async () => {
    await db.cards.add(makeCard())
    await db.audioBlobs.add(makeBlob())
    await updateCard('c1', {
      sentence: 'Hello there',
      translation: 'Olá, tudo bem',
      hints: [{ type: 'custom', text: 'x', source: 'user' }],
    })
    expect(await db.audioBlobs.where('cardId').equals('c1').count()).toBe(1)
  })

  it('limpa clozeRanges quando enviado vazio', async () => {
    await db.cards.add(makeCard({ clozeRanges: [{ start: 0, end: 5 }] }))
    await updateCard('c1', { sentence: 'Hello there', translation: 'Olá', hints: [], clozeRanges: [] })
    const card = (await db.cards.get('c1'))!
    expect(card.clozeRanges).toBeUndefined()
  })

  it('grava os destaques da frase e da tradução, e os limpa quando enviados vazios', async () => {
    await db.cards.add(makeCard())
    await updateCard('c1', {
      sentence: 'Hello there',
      translation: 'Olá, tudo bem',
      hints: [],
      emphasisRanges: [{ start: 0, end: 5 }],
      translationEmphasisRanges: [{ start: 5, end: 13 }],
    })
    const card = (await db.cards.get('c1'))!
    expect(card.emphasisRanges).toEqual([{ start: 0, end: 5 }])
    expect(card.translationEmphasisRanges).toEqual([{ start: 5, end: 13 }])

    await updateCard('c1', {
      sentence: 'Hello there',
      translation: 'Olá, tudo bem',
      hints: [],
      emphasisRanges: [],
      translationEmphasisRanges: [],
    })
    const cleared = (await db.cards.get('c1'))!
    expect(cleared.emphasisRanges).toBeUndefined()
    expect(cleared.translationEmphasisRanges).toBeUndefined()
  })

  it('grava a fonética e a remove quando enviada vazia', async () => {
    await db.cards.add(makeCard())
    await updateCard('c1', {
      sentence: 'Hello there',
      translation: 'Olá',
      phonetic: ' ˈbərd(ə)n ',
      hints: [],
    })
    expect((await db.cards.get('c1'))!.phonetic).toBe('ˈbərd(ə)n')

    await updateCard('c1', { sentence: 'Hello there', translation: 'Olá', phonetic: '', hints: [] })
    expect((await db.cards.get('c1'))!.phonetic).toBeUndefined()
  })
})

describe('trackDirty', () => {
  it('marca dirty e deletedAt ao criar sem os campos', async () => {
    await db.decks.add({
      id: 'd1',
      name: 'Inglês',
      createdAt: 1000,
      newCardsPerDay: 20,
      youngLimit: 50,
      updatedAt: 1000,
      listenFirst: false,
      voice: 'nova',
      speechRate: 1,
    } as unknown as Parameters<typeof db.decks.add>[0])

    const deck = (await db.decks.get('d1'))!
    expect(deck.dirty).toBe(1)
    expect(deck.deletedAt).toBe(0)
  })

  it('respeita o dirty informado pelo caller (apply do pull)', async () => {
    await db.cards.add(makeCard({ id: 'c9', dirty: 0 }))

    expect((await db.cards.get('c9'))!.dirty).toBe(0)
  })

  it('não re-suja quando o update nomeia dirty explicitamente', async () => {
    await db.cards.add(makeCard({ id: 'c1', dirty: 1 }))

    await db.cards.update('c1', { dirty: 0 })

    expect((await db.cards.get('c1'))!.dirty).toBe(0)
  })

  it('suja qualquer update que não nomeie dirty', async () => {
    await db.cards.add(makeCard({ id: 'c1', dirty: 0 }))

    await db.cards.update('c1', { sentence: 'Outra frase' })

    expect((await db.cards.get('c1'))!.dirty).toBe(1)
  })
})

describe('ensureDefaultDeck', () => {
  it('cria o baralho padrão na primeira abertura', async () => {
    const deck = await ensureDefaultDeck()

    expect(deck?.name).toBe(DEFAULT_DECK_NAME)
    expect(deck?.deletedAt).toBe(0)
    expect(await db.decks.count()).toBe(1)
  })

  it('não duplica quando chamada duas vezes', async () => {
    const first = await ensureDefaultDeck()
    const second = await ensureDefaultDeck()

    expect(second?.id).toBe(first?.id)
    expect(await db.decks.count()).toBe(1)
  })

  it('devolve null sem recriar quando o último deck foi excluído', async () => {
    const created = await ensureDefaultDeck()
    await deleteDeck(created!.id)

    const deck = await ensureDefaultDeck()

    expect(deck).toBeNull()
    expect(await db.decks.count()).toBe(1)
  })

  it('devolve o primeiro deck vivo quando já existem decks', async () => {
    await db.decks.bulkAdd([makeDeck({ id: 'dead', deletedAt: 500 }), makeDeck({ id: 'alive' })])

    const deck = await ensureDefaultDeck()

    expect(deck?.id).toBe('alive')
  })
})

describe('liveCards', () => {
  it('devolve só os cards vivos do deck pedido', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'c1' }),
      makeCard({ id: 'c2', deletedAt: 900 }),
      makeCard({ id: 'c3', deckId: 'outro' }),
    ])

    const ids = await liveCards('d1').primaryKeys()

    expect(ids).toEqual(['c1'])
  })
})

describe('deleteCard', () => {
  it('tombstona o card e apaga os áudios dele, preservando os dos outros', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000)
    await db.cards.bulkAdd([makeCard({ id: 'c1' }), makeCard({ id: 'c2' })])
    await db.audioBlobs.bulkAdd([makeBlob({ id: 'a1' }), makeBlob({ id: 'a2', cardId: 'c2' })])

    await deleteCard('c1')

    const card = (await db.cards.get('c1'))!
    expect(card.deletedAt).toBe(5000)
    expect(card.updatedAt).toBe(5000)
    expect(card.dirty).toBe(1)
    expect(await db.audioBlobs.where('cardId').equals('c1').count()).toBe(0)
    expect(await db.audioBlobs.where('cardId').equals('c2').count()).toBe(1)
  })
})

describe('deleteDeck', () => {
  it('tombstona o deck e cascateia nos cards vivos e nos áudios', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(7000)
    await db.decks.add(makeDeck({ id: 'd1' }))
    await db.cards.bulkAdd([
      makeCard({ id: 'c1' }),
      makeCard({ id: 'c2', deletedAt: 100, updatedAt: 100 }),
      makeCard({ id: 'c3', deckId: 'outro' }),
    ])
    await db.audioBlobs.bulkAdd([makeBlob({ id: 'a1' }), makeBlob({ id: 'a3', cardId: 'c3' })])

    await deleteDeck('d1')

    expect((await db.decks.get('d1'))!.deletedAt).toBe(7000)
    expect((await db.cards.get('c1'))!.deletedAt).toBe(7000)
    expect(await db.audioBlobs.where('cardId').equals('c1').count()).toBe(0)
  })

  it('não reescreve o tombstone de card já excluído antes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(7000)
    await db.decks.add(makeDeck({ id: 'd1' }))
    await db.cards.add(makeCard({ id: 'c2', deletedAt: 100, updatedAt: 100 }))

    await deleteDeck('d1')

    expect((await db.cards.get('c2'))!.deletedAt).toBe(100)
  })

  it('não toca nos cards de outro deck', async () => {
    await db.decks.add(makeDeck({ id: 'd1' }))
    await db.cards.add(makeCard({ id: 'c3', deckId: 'outro' }))

    await deleteDeck('d1')

    expect((await db.cards.get('c3'))!.deletedAt).toBe(0)
  })
})

describe('exportBackup', () => {
  it('serializa decks, cards e logs na versão 2, incluindo tombstones', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4242)
    await db.decks.add(makeDeck({ id: 'd1' }))
    await db.cards.bulkAdd([makeCard({ id: 'c1' }), makeCard({ id: 'c2', deletedAt: 10 })])
    await db.reviewLogs.add({
      id: 'l1',
      cardId: 'c1',
      deckId: 'd1',
      rating: 'good',
      reviewedAt: 1200,
      stateBefore: 0,
      scheduledDays: 1,
      durationMs: 3000,
      dirty: 0,
    })

    const payload = JSON.parse(await (await exportBackup()).text()) as {
      version: number
      exportedAt: number
      decks: Deck[]
      cards: Card[]
      reviewLogs: ReviewLog[]
    }

    expect(payload.version).toBe(2)
    expect(payload.exportedAt).toBe(4242)
    expect(payload.decks).toHaveLength(1)
    expect(payload.cards.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(payload.reviewLogs[0].deckId).toBe('d1')
  })
})

describe('downloadBackup', () => {
  it('dispara o download com o nome no formato lingo-backup-AAAA-MM-DD.json', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-09T10:00:00Z'))
    const { revokeObjectURL, restore } = stubObjectUrl('blob:fake')
    restoreObjectUrl = restore
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadBackup()

    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('lingo-backup-2026-03-09.json')
    expect(anchor.href).toBe('blob:fake')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})
