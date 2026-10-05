import { afterEach, describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { db, type Card } from './db'
import { countDeckCards } from './deckCounts'
import { resetDb } from '../test/dbHelpers'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    deckId: 'd1',
    sentence: 'Hello there',
    translation: 'Olá',
    hints: [],
    due: 1000,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

describe('countDeckCards', () => {
  afterEach(resetDb)

  it('devolve zeros para um baralho sem cartões', async () => {
    expect(await countDeckCards('d1')).toEqual({ total: 0, fresh: 0, learning: 0, review: 0 })
  })

  it('separa novos, aprendendo e em revisão', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a', state: State.New }),
      makeCard({ id: 'b', state: State.Learning }),
      makeCard({ id: 'c', state: State.Relearning }),
      makeCard({ id: 'd', state: State.Review }),
      makeCard({ id: 'e', state: State.Review }),
    ])
    expect(await countDeckCards('d1')).toEqual({ total: 5, fresh: 1, learning: 2, review: 2 })
  })

  it('ignora cartões excluídos e de outros baralhos', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a' }),
      makeCard({ id: 'b', deletedAt: 5000 }),
      makeCard({ id: 'c', deckId: 'd2' }),
    ])
    expect((await countDeckCards('d1')).total).toBe(1)
  })
})
