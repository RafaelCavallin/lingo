import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { db, DEFAULT_DECK_NAME, type Card, type Deck } from './db'
import { resetDb } from '../test/dbHelpers'
import { createFakeSupabase } from '../test/fakeSupabase'

let fakeSupabase: ReturnType<typeof createFakeSupabase>

// vi.mock is hoisted above these imports by Vitest, so `getSupabase` below
// always reads the `fakeSupabase` set in beforeEach, never a stale closure.
vi.mock('./supabase', () => ({
  isSyncConfigured: () => true,
  getSupabase: () => Promise.resolve(fakeSupabase.client),
}))

const { completeSignIn, decideOnSignIn, displayName, getBoundUserId, PULL_CURSOR_KEYS } = await import('./auth')

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: overrides.id ?? `deck-${Math.random()}`,
    name: DEFAULT_DECK_NAME,
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

function makeCard(deckId: string, overrides: Partial<Card> = {}): Card {
  return {
    id: overrides.id ?? `card-${Math.random()}`,
    deckId,
    sentence: 'Hello there',
    translation: 'Olá',
    hints: [],
    due: 1000,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: 0,
    dirty: 0,
    ...overrides,
  }
}

function setRemoteCounts(decks: number, cards: number, reviewLogs: number) {
  fakeSupabase.setDefaultResolution('decks', { data: [], error: null, count: decks })
  fakeSupabase.setDefaultResolution('cards', { data: [], error: null, count: cards })
  fakeSupabase.setDefaultResolution('review_logs', { data: [], error: null, count: reviewLogs })
}

beforeEach(() => {
  fakeSupabase = createFakeSupabase()
  setRemoteCounts(0, 0, 0)
})

afterEach(async () => {
  await resetDb()
})

describe('displayName', () => {
  it('uses user_metadata.name when present and non-empty', () => {
    const user = { email: 'a@b.com', user_metadata: { name: '  Rafael  ' } } as unknown as User
    expect(displayName(user)).toBe('Rafael')
  })

  it('falls back to the part of the e-mail before @ when there is no name', () => {
    const user = { email: 'rafael@example.com', user_metadata: {} } as unknown as User
    expect(displayName(user)).toBe('rafael')
  })

  it('falls back to "Conta" when there is neither name nor e-mail', () => {
    const user = { user_metadata: {} } as unknown as User
    expect(displayName(user)).toBe('Conta')
  })
})

describe('getBoundUserId', () => {
  it('is null before any account is bound', async () => {
    expect(await getBoundUserId()).toBeNull()
  })
})

describe('decideOnSignIn', () => {
  it('returns resume for the account already bound to this device', async () => {
    await completeSignIn('user-A', 'merge')
    expect(await decideOnSignIn('user-A')).toEqual({ kind: 'resume' })
  })

  it('returns account-switch when bound to a different account, never merging', async () => {
    await db.decks.add(makeDeck({ id: 'd1', name: 'Meu baralho' }))
    await completeSignIn('user-A', 'merge')
    setRemoteCounts(2, 10, 5)

    const decision = await decideOnSignIn('user-B')
    expect(decision.kind).toBe('account-switch')
    if (decision.kind !== 'account-switch') throw new Error('unreachable')
    expect(decision.local).toEqual({ decks: 1, cards: 0, reviewLogs: 0 })
    expect(decision.remote).toEqual({ decks: 2, cards: 10, reviewLogs: 5 })
  })

  it('discards an untouched default deck and auto-adopts, regardless of remote data', async () => {
    await db.decks.add(makeDeck({ id: 'default-deck', name: DEFAULT_DECK_NAME }))
    setRemoteCounts(1, 5, 5)

    const decision = await decideOnSignIn('user-C')
    expect(decision).toEqual({ kind: 'auto-adopt' })
    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })

  it('auto-adopts when the local database is empty (no default deck at all)', async () => {
    setRemoteCounts(3, 20, 8)
    expect(await decideOnSignIn('user-D')).toEqual({ kind: 'auto-adopt' })
  })

  it('auto-adopts when the remote account is empty', async () => {
    await db.decks.add(makeDeck({ id: 'd1', name: 'Meu baralho' }))
    await db.cards.add(makeCard('d1'))
    setRemoteCounts(0, 0, 0)

    expect(await decideOnSignIn('user-E')).toEqual({ kind: 'auto-adopt' })
  })

  it('asks the user when both sides have real data', async () => {
    await db.decks.add(makeDeck({ id: 'd1', name: 'Meu baralho' }))
    await db.cards.add(makeCard('d1'))
    setRemoteCounts(1, 7, 3)

    const decision = await decideOnSignIn('user-F')
    expect(decision.kind).toBe('needs-prompt')
    if (decision.kind !== 'needs-prompt') throw new Error('unreachable')
    expect(decision.local).toEqual({ decks: 1, cards: 1, reviewLogs: 0 })
    expect(decision.remote).toEqual({ decks: 1, cards: 7, reviewLogs: 3 })
  })

  it('auto-adopts into an empty account even when bound to a different one', async () => {
    await db.decks.add(makeDeck({ id: 'd1', name: 'Meu baralho' }))
    await db.cards.add(makeCard('d1'))
    await completeSignIn('user-J', 'merge')
    setRemoteCounts(0, 0, 0)

    // Conta recriada (ou trocada) sem dado nenhum: não há dois conjuntos para
    // escolher entre, então não há o que perguntar.
    expect(await decideOnSignIn('user-K')).toEqual({ kind: 'auto-adopt' })
  })

  it('auto-adopts an empty device into a full account even when bound to a different one', async () => {
    await completeSignIn('user-L', 'merge')
    setRemoteCounts(4, 40, 12)

    expect(await decideOnSignIn('user-M')).toEqual({ kind: 'auto-adopt' })
  })
})

describe('completeSignIn', () => {
  it('merge: marks everything dirty without touching updatedAt, then binds the account', async () => {
    await db.decks.add(makeDeck({ id: 'd1', updatedAt: 1234, dirty: 0 }))
    await db.cards.add(makeCard('d1', { id: 'c1', updatedAt: 5678, dirty: 0 }))

    await completeSignIn('user-G', 'merge')

    const deck = await db.decks.get('d1')
    const card = await db.cards.get('c1')
    expect(deck).toMatchObject({ dirty: 1, updatedAt: 1234 })
    expect(card).toMatchObject({ dirty: 1, updatedAt: 5678 })
    expect(await getBoundUserId()).toBe('user-G')
  })

  it('discard-local: wipes decks/cards/reviewLogs/audioBlobs, then binds the account', async () => {
    await db.decks.add(makeDeck({ id: 'd1' }))
    await db.cards.add(makeCard('d1', { id: 'c1' }))
    await db.audioBlobs.add({ id: 'a1', cardId: 'c1', kind: 'tts', blob: new Blob(['x']), createdAt: 1 })

    await completeSignIn('user-H', 'discard-local')

    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.audioBlobs.count()).toBe(0)
    expect(await getBoundUserId()).toBe('user-H')
  })

  it('merge: resets the pull cursors when rebinding to a different account', async () => {
    await completeSignIn('user-N', 'merge')
    for (const key of PULL_CURSOR_KEYS) {
      await db.syncState.put({ key, value: '2026-01-01T00:00:00.000Z' })
    }

    await completeSignIn('user-O', 'merge')

    // Sem isto, o pull pediria linhas mais novas que o cursor da conta velha
    // e a conta nova pareceria vazia para sempre.
    for (const key of PULL_CURSOR_KEYS) {
      expect(await db.syncState.get(key)).toBeUndefined()
    }
    expect(await getBoundUserId()).toBe('user-O')
  })

  it('merge: keeps the pull cursors when the device had no account bound', async () => {
    for (const key of PULL_CURSOR_KEYS) {
      await db.syncState.put({ key, value: '2026-01-01T00:00:00.000Z' })
    }

    await completeSignIn('user-P', 'merge')

    for (const key of PULL_CURSOR_KEYS) {
      expect(await db.syncState.get(key)).toBeDefined()
    }
  })

  it('cancel: signs out and never binds the account', async () => {
    await completeSignIn('user-I', 'cancel')

    expect(fakeSupabase.authSignOut).toHaveBeenCalledOnce()
    expect(await getBoundUserId()).toBeNull()
  })
})
