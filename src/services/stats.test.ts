import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { db, type Card, type Deck, type ReviewLog } from './db'
import { computeStats, paceAdvice, type Stats } from './stats'
import { YOUNG_STABILITY_DAYS } from './scheduler'
import { resetDb } from '../test/dbHelpers'

const NOW = new Date('2026-03-09T12:00:00')
const DAY = 86_400_000

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
    stability: 30,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 3,
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

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    retention30: 0.9,
    reviews30: 100,
    reviewsTotal: 100,
    streak: 3,
    byDay: new Map(),
    forecast: [],
    maturity: { mature: 10, young: 10, fresh: 5 },
    youngCount: 10,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(async () => {
  vi.useRealTimers()
  await resetDb()
})

describe('computeStats', () => {
  it('agrupa as revisões por dia', async () => {
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1' }),
      makeLog({ id: 'l2' }),
      makeLog({ id: 'l3', reviewedAt: NOW.getTime() - DAY }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.byDay.get('2026-03-09')).toBe(2)
    expect(stats.byDay.get('2026-03-08')).toBe(1)
    expect(stats.reviewsTotal).toBe(3)
  })

  it('calcula a retenção dos últimos 30 dias, ignorando o que é mais antigo', async () => {
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', rating: 'good' }),
      makeLog({ id: 'l2', rating: 'good' }),
      makeLog({ id: 'l3', rating: 'again' }),
      makeLog({ id: 'l4', rating: 'again', reviewedAt: NOW.getTime() - 31 * DAY }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.reviews30).toBe(3)
    expect(stats.retention30).toBeCloseTo(2 / 3)
  })

  it('devolve retenção nula quando não houve revisão na janela', async () => {
    await db.reviewLogs.add(makeLog({ reviewedAt: NOW.getTime() - 40 * DAY }))

    const stats = await computeStats(makeDeck())

    expect(stats.retention30).toBeNull()
    expect(stats.reviews30).toBe(0)
  })

  it('joga todo o atraso acumulado no primeiro dia da previsão', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'atrasado', due: NOW.getTime() - 10 * DAY }),
      makeCard({ id: 'hoje', due: NOW.getTime() + 3600_000 }),
      makeCard({ id: 'amanha', due: NOW.getTime() + DAY }),
      makeCard({ id: 'novo', state: State.New, due: NOW.getTime() }),
    ])

    const { forecast } = await computeStats(makeDeck())

    expect(forecast).toHaveLength(14)
    expect(forecast[0]).toEqual({ day: 'hoje', count: 2 })
    expect(forecast[1].count).toBe(1)
  })

  it('classifica a maturidade dos cartões vivos do deck', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'maduro', stability: 30 }),
      makeCard({ id: 'jovem', stability: 5 }),
      makeCard({ id: 'aprendendo', state: State.Learning }),
      makeCard({ id: 'novo', state: State.New }),
      makeCard({ id: 'excluido', deletedAt: 10 }),
      makeCard({ id: 'outro-deck', deckId: 'd2' }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.maturity).toEqual({ mature: 1, young: 2, fresh: 1 })
    expect(stats.youngCount).toBe(2)
  })

  it('usa o mesmo corte de estabilidade da fila para separar madura de não firmada', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'no-corte', stability: YOUNG_STABILITY_DAYS }),
      makeCard({ id: 'abaixo-do-corte', stability: YOUNG_STABILITY_DAYS - 0.5 }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.maturity).toEqual({ mature: 1, young: 1, fresh: 0 })
  })

  it('conta a sequência de dias seguidos até a primeira lacuna com cartão vencido', async () => {
    await db.cards.add(
      makeCard({ id: 'atrasado', createdAt: NOW.getTime() - 10 * DAY, due: NOW.getTime() - 10 * DAY }),
    )
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', reviewedAt: NOW.getTime() }),
      makeLog({ id: 'l2', reviewedAt: NOW.getTime() - DAY }),
      makeLog({ id: 'l3', reviewedAt: NOW.getTime() - 2 * DAY }),
      makeLog({ id: 'l5', reviewedAt: NOW.getTime() - 4 * DAY }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.streak).toBe(3)
  })

  it('não quebra a sequência quando hoje ainda está em branco', async () => {
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', reviewedAt: NOW.getTime() - DAY }),
      makeLog({ id: 'l2', reviewedAt: NOW.getTime() - 2 * DAY }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.streak).toBe(2)
  })

  it('devolve sequência zero quando havia cartão vencido e ontem e hoje ficaram sem revisão', async () => {
    await db.cards.add(
      makeCard({ id: 'atrasado', createdAt: NOW.getTime() - 10 * DAY, due: NOW.getTime() - 10 * DAY }),
    )
    await db.reviewLogs.add(makeLog({ reviewedAt: NOW.getTime() - 3 * DAY }))

    const stats = await computeStats(makeDeck())

    expect(stats.streak).toBe(0)
  })

  it('não quebra a sequência num dia sem nenhum cartão vencido para revisar', async () => {
    // O único cartão fica vencido no dia -4, é revisado nesse dia e só volta a
    // vencer no dia -1 — nos dias -3 e -2 não havia nada para revisar.
    await db.cards.add(
      makeCard({ id: 'unico', createdAt: NOW.getTime() - 4 * DAY, due: NOW.getTime() - 4 * DAY }),
    )
    await db.reviewLogs.bulkAdd([
      makeLog({ id: 'l1', cardId: 'unico', reviewedAt: NOW.getTime() - 4 * DAY, scheduledDays: 3 }),
      makeLog({ id: 'l2', cardId: 'unico', reviewedAt: NOW.getTime() - DAY, scheduledDays: 10 }),
    ])

    const stats = await computeStats(makeDeck())

    expect(stats.streak).toBe(2)
  })
})

describe('paceAdvice', () => {
  it('pede mais dados quando há menos de 30 revisões no mês', () => {
    const advice = paceAdvice(makeStats({ reviews30: 29 }), makeDeck())

    expect(advice).toMatch(/Poucas revisões/)
  })

  it('recomenda reduzir o teto quando a retenção cai abaixo de 80%', () => {
    const advice = paceAdvice(makeStats({ retention30: 0.79 }), makeDeck())

    expect(advice).toMatch(/reduzir o teto/)
  })

  it('explica a fila segurada quando os young batem o limite', () => {
    const advice = paceAdvice(makeStats({ youngCount: 50 }), makeDeck({ youngLimit: 50 }))

    expect(advice).toMatch(/teto de cartões novos está segurando/)
  })

  it('libera subir o teto com retenção alta e folga na fila', () => {
    const advice = paceAdvice(makeStats({ retention30: 0.95, youngCount: 20 }), makeDeck({ youngLimit: 50 }))

    expect(advice).toMatch(/subir o teto/)
  })

  it('diz para manter o ritmo quando nada indica ajuste', () => {
    const advice = paceAdvice(makeStats({ retention30: 0.88, youngCount: 20 }), makeDeck())

    expect(advice).toBe('Ritmo equilibrado. Mantenha como está.')
  })
})
