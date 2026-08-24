import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { db, type Card, type Deck, type ReviewLog } from './db'
import { MIN_REVIEWS, NotEnoughData, optimize, reviewCount } from './optimizer'
import { applyFsrsParameters } from './scheduler'
import { resetDb } from '../test/dbHelpers'

const NOW = new Date('2026-03-09T12:00:00Z')
const DAY = 86_400_000
const OPTIMIZED = Array.from({ length: 17 }, (_, i) => 0.5 + i)

type WorkerBehavior =
  | { kind: 'ok'; parameters: number[] }
  | { kind: 'fail'; error: string }
  | { kind: 'crash' }
  | { kind: 'silent' }

class FakeWorker {
  static behavior: WorkerBehavior = { kind: 'ok', parameters: OPTIMIZED }
  static lastRequest: unknown = null
  static terminated = 0

  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null

  postMessage(request: unknown) {
    FakeWorker.lastRequest = request
    const behavior = FakeWorker.behavior
    queueMicrotask(() => {
      if (behavior.kind === 'ok') this.onmessage?.({ data: { ok: true, parameters: behavior.parameters } })
      if (behavior.kind === 'fail') this.onmessage?.({ data: { ok: false, error: behavior.error } })
      if (behavior.kind === 'crash') this.onerror?.()
    })
  }

  terminate() {
    FakeWorker.terminated++
  }
}

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
    sentence: 'Hello there',
    translation: 'Olá',
    hints: [],
    due: NOW.getTime(),
    stability: 10,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 2,
    lapses: 0,
    state: State.Review,
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
    reviewedAt: NOW.getTime(),
    stateBefore: State.Review,
    scheduledDays: 1,
    durationMs: 3000,
    dirty: 0,
    ...overrides,
  }
}

/** Histórico mínimo aceito pelo otimizador: cada cartão com duas revisões. */
async function seedEnoughHistory(cardCount = MIN_REVIEWS / 2, deckId = 'd1') {
  await db.cards.bulkAdd(
    Array.from({ length: cardCount }, (_, i) => makeCard({ id: `c${i}`, deckId })),
  )
  await db.reviewLogs.bulkAdd(
    Array.from({ length: cardCount }, (_, i) => [
      makeLog({ id: `l${i}a`, cardId: `c${i}`, deckId, reviewedAt: NOW.getTime() - 3 * DAY }),
      makeLog({ id: `l${i}b`, cardId: `c${i}`, deckId, reviewedAt: NOW.getTime(), rating: 'again' }),
    ]).flat(),
  )
}

beforeEach(() => {
  FakeWorker.behavior = { kind: 'ok', parameters: OPTIMIZED }
  FakeWorker.lastRequest = null
  FakeWorker.terminated = 0
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(async () => {
  applyFsrsParameters()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  await resetDb()
})

describe('reviewCount', () => {
  it('conta as revisões do deck pedido', async () => {
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1' }),
      makeLog({ id: 'l2' }),
      makeLog({ id: 'l3', deckId: 'd2' }),
    ])

    expect(await reviewCount('d1')).toBe(2)
    expect(await reviewCount('d2')).toBe(1)
  })
})

describe('optimize', () => {
  it('recusa histórico curto dizendo quantas revisões faltam', async () => {
    await db.cards.add(makeCard())
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', reviewedAt: NOW.getTime() - DAY }),
      makeLog({ id: 'l2' }),
    ])

    const error = await optimize(makeDeck()).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotEnoughData)
    expect((error as Error).message).toContain(`${MIN_REVIEWS} revisões`)
    expect((error as Error).message).toContain('Você tem 2.')
  })

  it('descarta cartões com uma única revisão ao montar o histórico', async () => {
    await db.cards.bulkAdd([makeCard({ id: 'c1' }), makeCard({ id: 'c2' })])
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', cardId: 'c1', reviewedAt: NOW.getTime() - DAY }),
      makeLog({ id: 'l2', cardId: 'c1' }),
      makeLog({ id: 'l3', cardId: 'c2' }),
    ])

    await expect(optimize(makeDeck())).rejects.toThrow('Você tem 2.')
  })

  it('ignora revisões de cartões de outro deck ou já excluídos', async () => {
    await db.cards.bulkAdd([makeCard({ id: 'c1' }), makeCard({ id: 'morto', deletedAt: 50 })])
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', cardId: 'c1', reviewedAt: NOW.getTime() - DAY }),
      makeLog({ id: 'l2', cardId: 'c1' }),
      makeLog({ id: 'l3', cardId: 'morto', reviewedAt: NOW.getTime() - DAY }),
      makeLog({ id: 'l4', cardId: 'morto' }),
      makeLog({ id: 'l5', cardId: 'de-outro-deck' }),
    ])

    await expect(optimize(makeDeck())).rejects.toThrow('Você tem 2.')
  })

  it('manda o histórico em ordem, com o intervalo em dias desde a revisão anterior', async () => {
    await seedEnoughHistory()

    await optimize(makeDeck())

    const request = FakeWorker.lastRequest as {
      ratings: number[]
      deltaTs: number[]
      lengths: number[]
    }
    expect(request.ratings).toHaveLength(MIN_REVIEWS)
    expect(request.ratings.slice(0, 2)).toEqual([3, 1])
    expect(request.deltaTs.slice(0, 2)).toEqual([0, 3])
    expect(request.lengths[0]).toBe(2)
  })

  it('guarda os parâmetros no deck e passa a usá-los no agendamento', async () => {
    await seedEnoughHistory()
    await db.decks.add(makeDeck())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)

    const parameters = await optimize(makeDeck())

    const deck = (await db.decks.get('d1'))!
    expect(parameters).toEqual(OPTIMIZED)
    expect(deck.fsrsParams).toEqual(OPTIMIZED)
    expect(deck.paramsOptimizedAt).toBe(NOW.getTime())
    expect(deck.updatedAt).toBe(NOW.getTime())
    expect(deck.dirty).toBe(1)
  })

  it('encerra o worker mesmo quando a otimização falha', async () => {
    await seedEnoughHistory()
    FakeWorker.behavior = { kind: 'fail', error: 'histórico inconsistente' }

    await expect(optimize(makeDeck())).rejects.toThrow('histórico inconsistente')
    expect(FakeWorker.terminated).toBe(1)
  })

  it('avisa quando o worker não pôde ser carregado', async () => {
    await seedEnoughHistory()
    FakeWorker.behavior = { kind: 'crash' }

    await expect(optimize(makeDeck())).rejects.toThrow('O otimizador não pôde ser carregado.')
  })

  it('desiste depois de 3 minutos sem resposta do worker', async () => {
    await seedEnoughHistory()
    FakeWorker.behavior = { kind: 'silent' }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    const pending = expect(optimize(makeDeck())).rejects.toThrow('O otimizador demorou demais.')
    await vi.advanceTimersByTimeAsync(180_000)

    await pending
    expect(FakeWorker.terminated).toBe(1)
  })
})
