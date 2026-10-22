import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  default_w,
  fsrs,
  generatorParameters,
  migrateParameters,
  State,
  type CardInput,
} from 'ts-fsrs'
import { db, type Card } from './db'
import { createScheduler, describeParameters, isValidOptimizedParameters } from './fsrsConfig'
import { answer, applyFsrsParameters, buildQueue } from './scheduler'
import { resetDb } from '../test/dbHelpers'

const NOW = new Date('2026-03-09T12:00:00Z')
const DAY = 86_400_000
const MINUTE = 60_000

const FSRS5_19_PARAMETERS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]
const FSRS5_17_PARAMETERS = FSRS5_19_PARAMETERS.slice(0, 17)
const OPTIMIZED_21_PARAMETERS = [
  0.5, 1.5, 3, 15, 7.2, 0.6, 1.5, 0.05, 3.5, 0.2, 1.5, 2.1, 0.05, 0.4, 2.3, 0.3, 3, 0.5, 0.1, 0.05,
  0.2,
]

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

const newCard = () =>
  makeCard({ state: State.New, reps: 0, stability: 0, difficulty: 0, scheduledDays: 0, lastReview: undefined })

const learningCard = (state = State.Learning) =>
  makeCard({ state, reps: 1, stability: 0.4, difficulty: 6, scheduledDays: 0, lastReview: NOW.getTime() - 10 * MINUTE })

async function answered(card: Card, rating: 'again' | 'good'): Promise<Card> {
  await db.cards.add(card)
  await answer(card, rating, 1000)
  return (await db.cards.get(card.id))!
}

function referenceNext(card: Card, w?: number[]) {
  const config = { request_retention: 0.9, enable_fuzz: true, ...(w ? { w } : {}) }
  const input: CardInput = {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  }
  return fsrs(generatorParameters(config)).next(input, NOW, 3).card
}

const referenceDue = (card: Card, w?: number[]) => referenceNext(card, w).due.getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(async () => {
  applyFsrsParameters()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await resetDb()
})

describe('passos de aprendizado', () => {
  it('traz o cartão novo de volta em 1 min ao errar', async () => {
    const stored = await answered(newCard(), 'again')

    expect(stored.due).toBe(NOW.getTime() + MINUTE)
    expect(stored.state).toBe(State.Learning)
  })

  it('traz o cartão novo de volta em 10 min ao acertar', async () => {
    const stored = await answered(newCard(), 'good')

    expect(stored.due).toBe(NOW.getTime() + 10 * MINUTE)
    expect(stored.state).toBe(State.Learning)
  })

  it('mantém o cartão em aprendizado e o traz em 5 min ao errar', async () => {
    const stored = await answered(learningCard(), 'again')

    expect(stored.due).toBe(NOW.getTime() + 5 * MINUTE)
    expect(stored.state).toBe(State.Learning)
  })

  it('gradua o cartão em aprendizado ao acertar', async () => {
    const stored = await answered(learningCard(), 'good')

    expect(stored.state).toBe(State.Review)
    expect(stored.scheduledDays).toBeGreaterThanOrEqual(1)
  })

  it('leva o cartão em revisão para reaprendizado em 5 min ao errar', async () => {
    const stored = await answered(makeCard(), 'again')

    expect(stored.due).toBe(NOW.getTime() + 5 * MINUTE)
    expect(stored.state).toBe(State.Relearning)
    expect(stored.lapses).toBe(1)
  })

  it('traz o cartão em reaprendizado em 5 min ao errar', async () => {
    const stored = await answered(learningCard(State.Relearning), 'again')

    expect(stored.due).toBe(NOW.getTime() + 5 * MINUTE)
    expect(stored.state).toBe(State.Relearning)
  })

  it('devolve o cartão em reaprendizado à revisão ao acertar', async () => {
    const stored = await answered(learningCard(State.Relearning), 'good')

    expect(stored.state).toBe(State.Review)
    expect(stored.scheduledDays).toBeGreaterThanOrEqual(1)
  })

  it('continua do ponto certo o cartão em aprendizado gravado antes da atualização', async () => {
    const legacy = learningCard()
    expect('learning_steps' in legacy).toBe(false)

    const stored = await answered(legacy, 'again')

    expect(stored.state).toBe(State.Learning)
    expect(stored.due).toBe(NOW.getTime() + 5 * MINUTE)
  })
})

describe('parâmetros do agendamento', () => {
  it('agenda com os padrões do FSRS-6 quando o baralho não tem parâmetros', async () => {
    const card = makeCard()

    const stored = await answered(card, 'good')

    expect(stored.due).toBe(referenceDue(card, [...default_w]))
  })

  it('muda o intervalo de "Acertei" ao aplicar 21 parâmetros diferentes dos padrões', async () => {
    const card = makeCard()
    applyFsrsParameters(OPTIMIZED_21_PARAMETERS)

    const stored = await answered(card, 'good')

    expect(stored.due).toBe(referenceDue(card, OPTIMIZED_21_PARAMETERS))
    expect(stored.due).not.toBe(referenceDue(card, [...default_w]))
  })

  it.each([
    ['17', FSRS5_17_PARAMETERS],
    ['19', FSRS5_19_PARAMETERS],
  ])('aceita um vetor de %s parâmetros com o comportamento do FSRS-5', async (_size, vector) => {
    const card = makeCard()
    applyFsrsParameters(vector)

    const stored = await answered(card, 'good')

    const expected = referenceNext(card, migrateParameters(vector))
    expect(stored.due).toBe(expected.due.getTime())
    expect(stored.stability).toBe(expected.stability)
    expect(stored.stability).not.toBe(referenceNext(card, [...default_w]).stability)
  })

  it('usa os padrões e não lança erro com um vetor de tamanho inválido', async () => {
    const card = makeCard()
    expect(() => createScheduler([1, 2, 3])).not.toThrow()
    applyFsrsParameters([1, 2, 3])

    const stored = await answered(card, 'good')

    expect(stored.due).toBe(referenceDue(card, [...default_w]))
  })
})

describe('cartões gravados pela versão anterior', () => {
  it('chegam intactos depois de montar a fila, sem nenhuma escrita', async () => {
    const stored = [
      makeCard({ id: 'rev' }),
      makeCard({ id: 'aprendendo', state: State.Learning, reps: 1, stability: 0.4 }),
      makeCard({ id: 'reaprendendo', state: State.Relearning, lapses: 1 }),
      newCard(),
    ].map((card, i) => ({ ...card, id: `${card.id}-${i}` }))
    await db.cards.bulkAdd(stored)
    const deck = { id: 'd1', youngLimit: 50, newCardsPerDay: 20 } as Parameters<typeof buildQueue>[0]

    const queue = await buildQueue(deck)

    expect(queue.length).toBeGreaterThan(0)
    expect(await db.cards.orderBy('id').toArray()).toEqual([...stored].sort((a, b) => a.id.localeCompare(b.id)))
  })
})

describe('describeParameters', () => {
  it('descreve o baralho sem parâmetros como padrão do FSRS-6', () => {
    expect(describeParameters({})).toEqual({ fsrsVersion: 'FSRS-6', source: 'default', optimizedAt: null })
  })

  it('descreve 21 parâmetros como otimizados, com a data', () => {
    const info = describeParameters({ fsrsParams: OPTIMIZED_21_PARAMETERS, paramsOptimizedAt: 5000 })

    expect(info).toEqual({ fsrsVersion: 'FSRS-6', source: 'optimized', optimizedAt: 5000 })
  })

  it.each([
    ['17', FSRS5_17_PARAMETERS],
    ['19', FSRS5_19_PARAMETERS],
  ])('descreve %s parâmetros como de versão anterior', (_size, vector) => {
    expect(describeParameters({ fsrsParams: vector, paramsOptimizedAt: 5000 }).source).toBe('legacy')
  })

  it('trata vetor vazio ou de tamanho inválido como padrão, sem data', () => {
    expect(describeParameters({ fsrsParams: [], paramsOptimizedAt: 5000 }).source).toBe('default')
    expect(describeParameters({ fsrsParams: [1, 2, 3], paramsOptimizedAt: 5000 }).optimizedAt).toBeNull()
  })
})

describe('isValidOptimizedParameters', () => {
  it('aceita exatamente 21 valores finitos', () => {
    expect(isValidOptimizedParameters(OPTIMIZED_21_PARAMETERS)).toBe(true)
  })

  it.each([
    ['NaN', [...OPTIMIZED_21_PARAMETERS.slice(0, 20), Number.NaN]],
    ['Infinity', [...OPTIMIZED_21_PARAMETERS.slice(0, 20), Number.POSITIVE_INFINITY]],
    ['19 valores', FSRS5_19_PARAMETERS],
    ['22 valores', [...OPTIMIZED_21_PARAMETERS, 1]],
    ['vazio', []],
  ])('recusa %s', (_motivo, parameters) => {
    expect(isValidOptimizedParameters(parameters)).toBe(false)
  })
})
