import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { estimateBackupSize } from './backupRecords'
import { db, type AudioBlob, type Card, type Deck } from './db'
import { resetDb } from '../test/dbHelpers'

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


function makeBlob(overrides: Partial<AudioBlob> = {}): AudioBlob {
  return {
    id: 'a1',
    cardId: 'c1',
    kind: 'tts',
    blob: new Blob(['narracao'], { type: 'audio/mpeg' }),
    createdAt: 1200,
    voice: 'nova',
    ...overrides,
  }
}

function makeRecording(overrides: Partial<AudioBlob> = {}): AudioBlob {
  return makeBlob({
    id: 'r1',
    kind: 'user_recording',
    blob: new Blob(['gravacao do usuario'], { type: 'audio/webm' }),
    voice: undefined,
    ...overrides,
  })
}

beforeEach(async () => {
  await db.decks.add(makeDeck())
  await db.cards.add(makeCard())
})

afterEach(async () => {
  await resetDb()
})

describe('estimateBackupSize', () => {
  it('soma separadamente o tamanho de dados, gravações e narrações', async () => {
    await db.audioBlobs.bulkAdd([makeBlob(), makeRecording()])

    const estimate = await estimateBackupSize()

    expect(estimate.recordings).toBe(new Blob(['gravacao do usuario']).size)
    expect(estimate.narrations).toBe(new Blob(['narracao']).size)
    expect(estimate.data).toBeGreaterThan(0)
  })

  it('não conta o áudio que não entraria no arquivo', async () => {
    await db.audioBlobs.add(makeRecording({ id: 'r2', cardId: 'sumiu' }))

    const estimate = await estimateBackupSize()

    expect(estimate.recordings).toBe(0)
  })
})
