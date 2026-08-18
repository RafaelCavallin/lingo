import { afterEach, describe, expect, it } from 'vitest'
import { db, updateCard, type AudioBlob, type Card } from './db'
import { resetDb } from '../test/dbHelpers'

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

afterEach(resetDb)

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
