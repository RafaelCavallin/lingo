import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { db, type Card, type Deck } from './db'
import {
  applyFsrsParameters,
  answer,
  buildQueue,
  estimateMinutes,
  formatInterval,
  newCard,
  queueCount,
  totalQueueCount,
} from './scheduler'
import { resetDb } from '../test/dbHelpers'

const NOW = new Date('2026-03-09T12:00:00Z')
const DAY = 86_400_000

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    sentence: 'Hello there',
    translation: 'Olá',
    hints: [],
    due: NOW.getTime() - DAY,
    stability: 10,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 3,
    lapses: 0,
    state: State.Review,
    lastReview: NOW.getTime() - DAY,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(async () => {
  applyFsrsParameters()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await resetDb()
})

describe('newCard', () => {
  it('cria o cartão no estado New, aparado e já sujo para o sync', () => {
    const card = newCard('d1', '  I gave up  ', '  Eu desisti  ', [
      { type: 'phrasal_verb', text: 'give up', source: 'ai' },
    ])

    expect(card.sentence).toBe('I gave up')
    expect(card.translation).toBe('Eu desisti')
    expect(card.state).toBe(State.New)
    expect(card.reps).toBe(0)
    expect(card.deletedAt).toBe(0)
    expect(card.dirty).toBe(1)
    expect(card.createdAt).toBe(NOW.getTime())
  })

  it('guarda a fonética aparada e a omite quando vem em branco', () => {
    expect(newCard('d1', 'burden', 'fardo', [], '  ˈbərd(ə)n ').phonetic).toBe('ˈbərd(ə)n')
    expect(newCard('d1', 'burden', 'fardo', [], '   ').phonetic).toBeUndefined()
    expect(newCard('d1', 'burden', 'fardo', []).phonetic).toBeUndefined()
  })

  it('gera ids distintos a cada chamada', () => {
    expect(newCard('d1', 'a', 'a', []).id).not.toBe(newCard('d1', 'a', 'a', []).id)
  })
})

describe('answer', () => {
  it('grava o novo agendamento no card e marca dirty', async () => {
    const card = makeCard()
    await db.cards.add(card)

    await answer(card, 'good', 4200)

    const stored = (await db.cards.get('c1'))!
    expect(stored.due).toBeGreaterThan(NOW.getTime())
    expect(stored.reps).toBe(card.reps + 1)
    expect(stored.lastReview).toBe(NOW.getTime())
    expect(stored.updatedAt).toBe(NOW.getTime())
    expect(stored.dirty).toBe(1)
  })

  it('registra o log da revisão com o deck denormalizado e a duração', async () => {
    const card = makeCard()
    await db.cards.add(card)

    await answer(card, 'again', 9000)

    const log = (await db.reviewLogs.toArray())[0]
    expect(log).toMatchObject({
      cardId: 'c1',
      deckId: 'd1',
      rating: 'again',
      reviewedAt: NOW.getTime(),
      stateBefore: State.Review,
      durationMs: 9000,
      dirty: 1,
    })
  })

  it('agenda "again" para antes de "good" a partir do mesmo estado', async () => {
    const card = makeCard()
    await db.cards.bulkAdd([card, makeCard({ id: 'c2' })])

    await answer(card, 'again', 1000)
    await answer(makeCard({ id: 'c2' }), 'good', 1000)

    const again = (await db.cards.get('c1'))!
    const good = (await db.cards.get('c2'))!
    expect(again.due).toBeLessThan(good.due)
    expect(again.lapses).toBe(1)
    expect(good.lapses).toBe(0)
  })

  it('leva o cartão novo para fora do estado New', async () => {
    const card = makeCard({ state: State.New, reps: 0, stability: 0, lastReview: undefined })
    await db.cards.add(card)

    await answer(card, 'good', 1000)

    expect((await db.cards.get('c1'))!.state).not.toBe(State.New)
  })
})

describe('applyFsrsParameters', () => {
  it('é determinístico com os mesmos parâmetros e muda o agendamento com parâmetros novos', async () => {
    const card = makeCard()
    await db.cards.bulkAdd([card, makeCard({ id: 'c2' }), makeCard({ id: 'c3' })])

    await answer(card, 'good', 1000)
    const padraoA = (await db.cards.get('c1'))!.due

    applyFsrsParameters()
    await answer(makeCard({ id: 'c2' }), 'good', 1000)
    const padraoB = (await db.cards.get('c2'))!.due

    applyFsrsParameters([
      0.5, 1.5, 3, 15, 7.2, 0.6, 1.5, 0.05, 3.5, 0.2, 1.5, 2.1, 0.05, 0.4, 2.3, 0.3, 3,
    ])
    await answer(makeCard({ id: 'c3' }), 'good', 1000)
    const otimizado = (await db.cards.get('c3'))!.due

    expect(padraoB).toBe(padraoA)
    expect(otimizado).not.toBe(padraoA)
  })
})

describe('queueCount', () => {
  it('conta a fila do dia do baralho: vencidos e os novos que couberem', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'vencido' }),
      makeCard({ id: 'futuro', due: NOW.getTime() + DAY }),
      makeCard({ id: 'novo', state: State.New }),
      makeCard({ id: 'excluido', deletedAt: 500 }),
      makeCard({ id: 'outro-deck', deckId: 'd2' }),
    ])

    expect(await queueCount(makeDeck())).toBe(2)
  })

  it('respeita o limite de novos por dia do baralho', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'novo-1', state: State.New }),
      makeCard({ id: 'novo-2', state: State.New }),
    ])

    expect(await queueCount(makeDeck({ newCardsPerDay: 1 }))).toBe(1)
  })
})

describe('totalQueueCount', () => {
  it('soma os baralhos, para o aviso de fila fora do ativo', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a' }),
      makeCard({ id: 'b', deckId: 'd2' }),
      makeCard({ id: 'c', deckId: 'd2', state: State.New }),
    ])

    expect(await totalQueueCount([makeDeck(), makeDeck({ id: 'd2' })])).toBe(3)
  })

  it('devolve zero sem baralhos', async () => {
    expect(await totalQueueCount([])).toBe(0)
  })
})

describe('buildQueue', () => {
  it('põe os vencidos em ordem de vencimento', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'novo-atraso', due: NOW.getTime() - DAY }),
      makeCard({ id: 'mais-atrasado', due: NOW.getTime() - 5 * DAY }),
    ])

    const queue = await buildQueue(makeDeck({ newCardsPerDay: 0 }))

    expect(queue.map((c) => c.id)).toEqual(['mais-atrasado', 'novo-atraso'])
  })

  it('respeita o teto diário de cartões novos', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'n1', state: State.New, createdAt: 1 }),
      makeCard({ id: 'n2', state: State.New, createdAt: 2 }),
      makeCard({ id: 'n3', state: State.New, createdAt: 3 }),
    ])

    const queue = await buildQueue(makeDeck({ newCardsPerDay: 2 }))

    expect(queue.map((c) => c.id)).toEqual(['n1', 'n2'])
  })

  it('segura os novos quando os young já ocupam o limite', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'young1', stability: 2, due: NOW.getTime() + DAY }),
      makeCard({ id: 'young2', state: State.Learning, due: NOW.getTime() + DAY }),
      makeCard({ id: 'n1', state: State.New }),
    ])

    const queue = await buildQueue(makeDeck({ youngLimit: 2 }))

    expect(queue).toEqual([])
  })

  it('desconta os novos já introduzidos hoje do teto diário', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'introduzido' }),
      makeCard({ id: 'n1', state: State.New, createdAt: 1 }),
      makeCard({ id: 'n2', state: State.New, createdAt: 2 }),
    ])
    await db.reviewLogs.add({
      id: 'l1',
      cardId: 'introduzido',
      deckId: 'd1',
      rating: 'good',
      reviewedAt: NOW.getTime() - 3600_000,
      stateBefore: State.New,
      scheduledDays: 1,
      durationMs: 1000,
      dirty: 0,
    })

    const queue = await buildQueue(makeDeck({ newCardsPerDay: 2 }))

    expect(queue.filter((c) => c.state === State.New).map((c) => c.id)).toEqual(['n1'])
  })

  it('ignora introduções de outro deck ao descontar o teto', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'de-outro', deckId: 'd2' }),
      makeCard({ id: 'n1', state: State.New, createdAt: 1 }),
    ])
    await db.reviewLogs.add({
      id: 'l1',
      cardId: 'de-outro',
      deckId: 'd2',
      rating: 'good',
      reviewedAt: NOW.getTime() - 3600_000,
      stateBefore: State.New,
      scheduledDays: 1,
      durationMs: 1000,
      dirty: 0,
    })

    const queue = await buildQueue(makeDeck({ newCardsPerDay: 1 }))

    expect(queue.map((c) => c.id)).toEqual(['n1'])
  })

  it('intercala os novos entre os vencidos em vez de empilhá-los no fim', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'v1', due: NOW.getTime() - 4 * DAY }),
      makeCard({ id: 'v2', due: NOW.getTime() - 3 * DAY }),
      makeCard({ id: 'v3', due: NOW.getTime() - 2 * DAY }),
      makeCard({ id: 'v4', due: NOW.getTime() - DAY }),
      makeCard({ id: 'n1', state: State.New, createdAt: 1 }),
      makeCard({ id: 'n2', state: State.New, createdAt: 2 }),
    ])

    const queue = await buildQueue(makeDeck({ newCardsPerDay: 2 }))

    expect(queue.map((c) => c.id)).toEqual(['v1', 'v2', 'n1', 'v3', 'v4', 'n2'])
  })

  it('devolve só os novos quando não há vencidos', async () => {
    await db.cards.add(makeCard({ id: 'n1', state: State.New }))

    const queue = await buildQueue(makeDeck())

    expect(queue.map((c) => c.id)).toEqual(['n1'])
  })
})

describe('estimateMinutes', () => {
  it('usa 8s por cartão quando ainda não há histórico', async () => {
    expect(await estimateMinutes(15)).toBe(2)
  })

  it('usa a média das revisões recentes', async () => {
    await db.reviewLogs.bulkAdd(
      Array.from({ length: 10 }, (_, i) => ({
        id: `l${i}`,
        cardId: 'c1',
        deckId: 'd1',
        rating: 'good' as const,
        reviewedAt: NOW.getTime() - i * 1000,
        stateBefore: State.Review,
        scheduledDays: 1,
        durationMs: 30_000,
        dirty: 0 as const,
      })),
    )

    expect(await estimateMinutes(20)).toBe(10)
  })

  it('limita revisões absurdamente longas a 60s e nunca devolve menos de 1 minuto', async () => {
    await db.reviewLogs.add({
      id: 'l1',
      cardId: 'c1',
      deckId: 'd1',
      rating: 'good',
      reviewedAt: NOW.getTime(),
      stateBefore: State.Review,
      scheduledDays: 1,
      durationMs: 3_600_000,
      dirty: 0,
    })

    expect(await estimateMinutes(2)).toBe(2)
    expect(await estimateMinutes(0)).toBe(1)
  })
})

describe('formatInterval', () => {
  it('traduz o intervalo em dias para a faixa legível', () => {
    expect(formatInterval(0.4)).toBe('hoje')
    expect(formatInterval(1)).toBe('1 dia')
    expect(formatInterval(12.4)).toBe('12 dias')
    expect(formatInterval(90)).toBe('3 meses')
    expect(formatInterval(730)).toBe('2.0 anos')
  })
})
