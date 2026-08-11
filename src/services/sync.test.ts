import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type Card, type Deck, type ReviewLog } from './db'
import { resetDb } from '../test/dbHelpers'
import { createFakeSupabase } from '../test/fakeSupabase'

let fakeSupabase: ReturnType<typeof createFakeSupabase>
let syncConfigured = true

vi.mock('./supabase', () => ({
  isSyncConfigured: () => syncConfigured,
  getSupabase: () => Promise.resolve(fakeSupabase.client),
}))

const { syncNow } = await import('./sync')

/** Chave privada de services/auth.ts (`BOUND_USER_KEY`) — vincula a conta sem
 *  depender do fluxo completo de sign-in, que aqui não é o que se quer testar. */
async function bindUser(id: string) {
  await db.syncState.put({ key: 'boundUserId', value: id })
}

function remoteDeckRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'd1',
    name: 'Remoto',
    new_cards_per_day: 20,
    young_limit: 50,
    listen_first: false,
    voice: 'nova',
    speech_rate: 1,
    fsrs_params: null,
    params_optimized_at: null,
    created_at: 1000,
    updated_at: 2000,
    deleted_at: 0,
    synced_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeLocalDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Local',
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

function makeLocalCard(overrides: Partial<Card> = {}): Card {
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

function makeLocalLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: overrides.id ?? 'l1',
    cardId: 'c1',
    deckId: 'd1',
    rating: 'good',
    reviewedAt: 1000,
    stateBefore: 0,
    scheduledDays: 1,
    durationMs: 500,
    dirty: 0,
    ...overrides,
  }
}

beforeEach(() => {
  fakeSupabase = createFakeSupabase()
  syncConfigured = true
})

afterEach(async () => {
  await resetDb()
})

describe('syncNow — short circuits', () => {
  it('returns disabled when sync is not configured', async () => {
    syncConfigured = false
    expect(await syncNow('manual')).toEqual({ status: 'disabled' })
  })

  it('returns signed-out when no account is bound to this device', async () => {
    expect(await syncNow('manual')).toEqual({ status: 'signed-out' })
  })

  it('returns signed-out when bound but there is no active session', async () => {
    await bindUser('user-A')
    fakeSupabase.setSession(null)
    expect(await syncNow('manual')).toEqual({ status: 'signed-out' })
  })

  it('returns error when the session belongs to a different account than the one bound', async () => {
    await bindUser('user-A')
    fakeSupabase.setSession({ user: { id: 'user-B' } })
    const result = await syncNow('manual')
    expect(result.status).toBe('error')
  })

  it('returns offline when fetching the session itself fails', async () => {
    await bindUser('user-A')
    fakeSupabase.setSessionError(new TypeError('Failed to fetch'))
    expect(await syncNow('manual')).toEqual({ status: 'offline' })
  })
})

describe('syncNow — mutex', () => {
  it('returns a synthetic ok without touching the network when the lock is already held', async () => {
    await bindUser('user-A')
    fakeSupabase.setSession({ user: { id: 'user-A' } })
    vi.spyOn(navigator.locks, 'request').mockImplementationOnce((_name, _options, callback) =>
      Promise.resolve(callback(null)),
    )

    const result = await syncNow('manual')
    expect(result).toMatchObject({ status: 'ok', pulled: 0, pushed: 0 })
    expect(fakeSupabase.fromCalls).toHaveLength(0)
    expect(fakeSupabase.rpcCalls).toHaveLength(0)
  })
})

describe('syncNow — network errors during sync', () => {
  beforeEach(async () => {
    await bindUser('user-A')
    fakeSupabase.setSession({ user: { id: 'user-A' } })
  })

  it('maps a fetch-like rejection to offline', async () => {
    fakeSupabase.queueResolution('decks', { reject: new TypeError('Failed to fetch') })
    expect(await syncNow('manual')).toEqual({ status: 'offline' })
  })

  it('maps any other rejection to error with the message', async () => {
    fakeSupabase.queueResolution('decks', { reject: new Error('boom') })
    const result = await syncNow('manual')
    expect(result).toEqual({ status: 'error', message: 'boom' })
  })
})

describe('syncNow — pull / last-write-wins', () => {
  beforeEach(async () => {
    await bindUser('user-A')
    fakeSupabase.setSession({ user: { id: 'user-A' } })
  })

  it('adopts a remote row that does not exist locally yet', async () => {
    fakeSupabase.queueResolution('decks', { data: [remoteDeckRow()], error: null })
    const result = await syncNow('manual')
    expect(result.status).toBe('ok')
    const deck = await db.decks.get('d1')
    expect(deck?.name).toBe('Remoto')
  })

  it('overwrites the local row when the remote one is newer', async () => {
    await db.decks.add(makeLocalDeck({ name: 'Local', updatedAt: 1000, dirty: 0 }))
    fakeSupabase.queueResolution('decks', {
      data: [remoteDeckRow({ name: 'Remoto', updated_at: 2000 })],
      error: null,
    })
    await syncNow('manual')
    const deck = await db.decks.get('d1')
    expect(deck?.name).toBe('Remoto')
  })

  it('keeps the local row when the remote one is older', async () => {
    await db.decks.add(makeLocalDeck({ name: 'Local', updatedAt: 2000, dirty: 0 }))
    fakeSupabase.queueResolution('decks', {
      data: [remoteDeckRow({ name: 'Remoto', updated_at: 1000 })],
      error: null,
    })
    await syncNow('manual')
    const deck = await db.decks.get('d1')
    expect(deck?.name).toBe('Local')
  })

  it('keeps the local row when updatedAt ties', async () => {
    await db.decks.add(makeLocalDeck({ name: 'Local', updatedAt: 1000, dirty: 0 }))
    fakeSupabase.queueResolution('decks', {
      data: [remoteDeckRow({ name: 'Remoto', updated_at: 1000 })],
      error: null,
    })
    await syncNow('manual')
    const deck = await db.decks.get('d1')
    expect(deck?.name).toBe('Local')
  })
})

describe('syncNow — pull cursor / overlap window', () => {
  beforeEach(async () => {
    await bindUser('user-A')
    fakeSupabase.setSession({ user: { id: 'user-A' } })
  })

  it('starts from the epoch on the very first pull', async () => {
    await syncNow('manual')
    const call = fakeSupabase.fromCalls.find((c) => c.table === 'decks')!
    const gtOp = call.ops.find((op) => op[0] === 'gt')!
    expect(gtOp).toEqual(['gt', 'synced_at', '1970-01-01T00:00:00Z'])
  })

  it('stores the last synced_at as the next cursor, and rewinds it by the overlap window', async () => {
    fakeSupabase.queueResolution('decks', {
      data: [remoteDeckRow({ synced_at: '2026-01-01T00:00:10.000Z' })],
      error: null,
    })
    await syncNow('manual')
    const stored = await db.syncState.get('cursor:decks')
    expect(stored?.value).toBe('2026-01-01T00:00:10.000Z')

    await syncNow('manual')
    const secondCall = fakeSupabase.fromCalls.filter((c) => c.table === 'decks')[1]
    const gtOp = secondCall.ops.find((op) => op[0] === 'gt')!
    // OVERLAP_MS = 5_000 (sync.ts) — cursor rebobina 5s para não perder linhas
    // commitadas entre o início e o fim da transação remota.
    expect(gtOp).toEqual(['gt', 'synced_at', '2026-01-01T00:00:05.000Z'])
  })
})

describe('syncNow — push', () => {
  beforeEach(async () => {
    await bindUser('user-A')
    fakeSupabase.setSession({ user: { id: 'user-A' } })
  })

  it('pushes decks with the first card chunk, cards before logs, and clears dirty flags', async () => {
    await db.decks.add(makeLocalDeck({ dirty: 1 }))
    await db.cards.add(makeLocalCard({ id: 'c1', dirty: 1 }))
    await db.cards.add(makeLocalCard({ id: 'c2', dirty: 1 }))
    await db.reviewLogs.add(makeLocalLog({ id: 'l1', dirty: 1 }))

    const result = await syncNow('manual')
    expect(result.status).toBe('ok')
    expect(fakeSupabase.rpcCalls).toHaveLength(2)

    const [cardsCall, logsCall] = fakeSupabase.rpcCalls
    expect(cardsCall.name).toBe('sync_push')
    const cardsArgs = cardsCall.args as { p_decks: unknown[]; p_cards: unknown[]; p_logs: unknown[] }
    expect(cardsArgs.p_decks).toHaveLength(1)
    expect(cardsArgs.p_cards).toHaveLength(2)
    expect(cardsArgs.p_logs).toHaveLength(0)

    const logsArgs = logsCall.args as { p_decks: unknown[]; p_cards: unknown[]; p_logs: unknown[] }
    expect(logsArgs.p_decks).toHaveLength(0)
    expect(logsArgs.p_cards).toHaveLength(0)
    expect(logsArgs.p_logs).toHaveLength(1)

    expect((await db.decks.get('d1'))?.dirty).toBe(0)
    expect((await db.cards.get('c1'))?.dirty).toBe(0)
    expect((await db.cards.get('c2'))?.dirty).toBe(0)
    expect((await db.reviewLogs.get('l1'))?.dirty).toBe(0)
  })

  it('leaves a card dirty when it was edited again while its push was in flight (CAS)', async () => {
    await db.cards.add(makeLocalCard({ id: 'c1', sentence: 'original', updatedAt: 1000, dirty: 1 }))
    fakeSupabase.setRpcSideEffect(async () => {
      await db.cards.update('c1', { sentence: 'edited mid-flight', updatedAt: 1500 })
    })

    await syncNow('manual')

    const card = await db.cards.get('c1')
    expect(card?.sentence).toBe('edited mid-flight')
    expect(card?.dirty).toBe(1)
  })
})
