import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { db, type Card, type Deck, type ReviewLog } from './db'
import {
  INVALID_PARAMETERS_MESSAGE,
  MIN_REVIEWS,
  NotEnoughData,
  optimize,
  reviewCount,
} from './optimizer'
import { answer, applyFsrsParameters } from './scheduler'
import { describeParameters } from './fsrsConfig'
import { PROGRESS_POLL_MS } from './optimizerProgress'
import { resetDb } from '../test/dbHelpers'

const NOW = new Date('2026-03-09T12:00:00Z')
const DAY = 86_400_000
const OPTIMIZED = Array.from({ length: 21 }, (_, i) => 0.5 + i / 10)

type WorkerBehavior =
  | { kind: 'ok'; parameters: number[] }
  | { kind: 'fail'; error: string }
  | { kind: 'crash' }
  | { kind: 'silent' }
  | { kind: 'progress' }

class FakeWorker {
  static behavior: WorkerBehavior = { kind: 'ok', parameters: OPTIMIZED }
  static lastRequest: unknown = null
  static terminated = 0
  static counter = new ArrayBuffer(8)
  static current: FakeWorker | null = null
  static started: Promise<void> = Promise.resolve()
  private static markStarted: () => void = () => undefined

  static prepare() {
    FakeWorker.counter = new ArrayBuffer(8)
    FakeWorker.current = null
    FakeWorker.started = new Promise<void>((resolve) => {
      FakeWorker.markStarted = resolve
    })
  }

  static setCounter(processed: number, total: number) {
    new Uint32Array(FakeWorker.counter).set([processed, total])
  }

  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null

  postMessage(request: unknown) {
    FakeWorker.lastRequest = request
    FakeWorker.current = this
    FakeWorker.markStarted()
    const behavior = FakeWorker.behavior
    queueMicrotask(() => {
      if (behavior.kind === 'ok') this.reply({ type: 'done', parameters: behavior.parameters })
      if (behavior.kind === 'fail') this.reply({ type: 'error', error: behavior.error })
      if (behavior.kind === 'crash') this.onerror?.()
      if (behavior.kind === 'progress') {
        this.reply({ type: 'progress-source', buffer: FakeWorker.counter, pointer: 0 })
      }
    })
  }

  reply(data: unknown) {
    this.onmessage?.({ data })
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
  FakeWorker.prepare()
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
    expect(request.lengths).toEqual(Array(MIN_REVIEWS / 2).fill(2))
  })

  it('manda uma sequência por revisão em outro dia e omite as do mesmo dia', async () => {
    await seedEnoughHistory()
    await db.cards.add(makeCard({ id: 'longo' }))
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'x1', cardId: 'longo', reviewedAt: NOW.getTime() - 9 * DAY, rating: 'again' }),
      makeLog({ id: 'x2', cardId: 'longo', reviewedAt: NOW.getTime() - 9 * DAY + 60_000 }),
      makeLog({ id: 'x3', cardId: 'longo', reviewedAt: NOW.getTime() - 7 * DAY }),
      makeLog({ id: 'x4', cardId: 'longo', reviewedAt: NOW.getTime() }),
    ])

    await optimize(makeDeck())

    const request = FakeWorker.lastRequest as { deltaTs: number[]; lengths: number[] }
    expect(request.lengths.slice(0, 2)).toEqual([3, 4])
    expect(request.deltaTs.slice(0, 7)).toEqual([0, 0, 2, 0, 0, 2, 7])
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

  it('passa a agendar com os parâmetros otimizados', async () => {
    await seedEnoughHistory()
    await db.decks.add(makeDeck())
    await db.cards.bulkAdd([makeCard({ id: 'antes' }), makeCard({ id: 'depois' })])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await answer((await db.cards.get('antes'))!, 'good', 1000)

    await optimize(makeDeck())
    await answer((await db.cards.get('depois'))!, 'good', 1000)

    const [antes, depois] = await db.cards.bulkGet(['antes', 'depois'])
    expect(depois!.stability).not.toBe(antes!.stability)
  })

  it.each([
    ['tamanho 19', Array.from({ length: 19 }, () => 1)],
    ['tamanho 22', Array.from({ length: 22 }, () => 1)],
    ['valor não finito', [...OPTIMIZED.slice(0, 20), Number.NaN]],
  ])('recusa parâmetros com %s e não mexe no deck', async (_motivo, parameters) => {
    await seedEnoughHistory()
    await db.decks.add(makeDeck())
    FakeWorker.behavior = { kind: 'ok', parameters }

    await expect(optimize(makeDeck())).rejects.toThrow(INVALID_PARAMETERS_MESSAGE)

    const deck = (await db.decks.get('d1'))!
    expect(deck.fsrsParams).toBeUndefined()
    expect(deck.paramsOptimizedAt).toBeUndefined()
    expect(deck.dirty).toBe(0)
    expect(FakeWorker.terminated).toBe(1)
  })

  it('otimizar um baralho não muda o agendamento de outro', async () => {
    await seedEnoughHistory()
    await db.decks.bulkAdd([makeDeck(), makeDeck({ id: 'd2', name: 'Espanhol' })])
    await db.cards.bulkAdd([makeCard({ id: 'base', deckId: 'd2' }), makeCard({ id: 'outro', deckId: 'd2' })])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await answer((await db.cards.get('base'))!, 'good', 1000)

    await optimize(makeDeck())
    const outro = (await db.decks.get('d2'))!
    applyFsrsParameters(outro.fsrsParams)
    await answer((await db.cards.get('outro'))!, 'good', 1000)

    const [base, depois] = await db.cards.bulkGet(['base', 'outro'])
    expect(depois!.stability).toBe(base!.stability)
    expect(depois!.due).toBe(base!.due)
    expect(describeParameters(outro).source).toBe('default')
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

describe('optimize — progresso', () => {
  const fakePollTimers = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

  async function startOptimizing(onProgress: (p: unknown) => void) {
    await seedEnoughHistory()
    const pending = optimize(makeDeck(), { onProgress })
    await FakeWorker.started
    await Promise.resolve()
    return pending
  }

  it('informa o progresso lido da memória e para de ler depois do fim', async () => {
    FakeWorker.behavior = { kind: 'progress' }
    fakePollTimers()
    const calls: unknown[] = []

    const pending = startOptimizing((p) => calls.push(p))
    await FakeWorker.started
    FakeWorker.setCounter(100, 1000)
    await vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS)
    FakeWorker.setCounter(400, 1000)
    await vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS)
    FakeWorker.current!.reply({ type: 'done', parameters: OPTIMIZED })
    await pending
    const seen = calls.length
    FakeWorker.setCounter(999, 1000)
    await vi.advanceTimersByTimeAsync(5 * PROGRESS_POLL_MS)

    expect(calls[0]).toBeNull()
    expect(calls.slice(-2)).toEqual([{ processed: 100, total: 1000 }, { processed: 400, total: 1000 }])
    expect(calls).toHaveLength(seen)
  })

  it('fica indeterminado quando o worker não envia a fonte do progresso', async () => {
    const calls: unknown[] = []

    await startOptimizing((p) => calls.push(p))

    expect(calls).toEqual([null])
  })

  it('para a leitura do progresso quando o worker responde com erro', async () => {
    FakeWorker.behavior = { kind: 'progress' }
    fakePollTimers()
    const calls: unknown[] = []

    const pending = startOptimizing((p) => calls.push(p))
    const failed = expect(pending).rejects.toThrow('falhou no meio')
    await FakeWorker.started
    FakeWorker.setCounter(100, 1000)
    await vi.advanceTimersByTimeAsync(PROGRESS_POLL_MS)
    FakeWorker.current!.reply({ type: 'error', error: 'falhou no meio' })
    await failed
    const seen = calls.length
    await vi.advanceTimersByTimeAsync(5 * PROGRESS_POLL_MS)

    expect(calls).toHaveLength(seen)
    expect(FakeWorker.terminated).toBe(1)
  })

  it('para a leitura do progresso ao estourar o tempo', async () => {
    FakeWorker.behavior = { kind: 'progress' }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const calls: unknown[] = []
    await seedEnoughHistory()

    const pending = expect(
      optimize(makeDeck(), { onProgress: (p) => calls.push(p) }),
    ).rejects.toThrow('O otimizador demorou demais.')
    await vi.advanceTimersByTimeAsync(180_000)
    await pending
    const seen = calls.length
    await vi.advanceTimersByTimeAsync(5 * PROGRESS_POLL_MS)

    expect(calls).toHaveLength(seen)
    expect(FakeWorker.terminated).toBe(1)
  })
})
