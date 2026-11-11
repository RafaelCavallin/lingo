import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBackup } from './backupPreview'
import { restoreBackup } from './backupRestore'
import { db } from './db'
import { backupOf, makeCard, makeDeck, makeLog } from '../test/backupFixtures'
import { resetDb } from '../test/dbHelpers'
import { createFakeSupabase } from '../test/fakeSupabase'

let fakeSupabase: ReturnType<typeof createFakeSupabase>

vi.mock('./supabase', () => ({
  isSyncConfigured: () => true,
  getSupabase: () => Promise.resolve(fakeSupabase.client),
}))

const { syncNow } = await import('./sync')

interface PushArgs {
  p_cards: { id: string }[]
  p_logs: { id: string }[]
}

const SAME_PHRASE = { sentence: 'I gave up', translation: 'Eu desisti' }

beforeEach(() => {
  fakeSupabase = createFakeSupabase()
  fakeSupabase.setSession({ user: { id: 'user-A' } })
})

async function bindAccount(): Promise<void> {
  await db.syncState.put({ key: 'boundUserId', value: 'user-A' })
}

afterEach(async () => {
  await resetDb()
})

describe('restauração com duplicatas e o sync', () => {
  it('envia só o que foi aplicado: nem o cartão pulado nem as revisões dele', async () => {
    const file = await backupOf({
      decks: [makeDeck()],
      cards: [makeCard({ id: 'file-dup', ...SAME_PHRASE }), makeCard({ id: 'file-new', sentence: 'Outra', translation: 'Outra' })],
      reviewLogs: [makeLog({ id: 'log-dup', cardId: 'file-dup' }), makeLog({ id: 'log-new', cardId: 'file-new' })],
    })
    await bindAccount()
    await db.decks.add(makeDeck())
    await db.cards.add(makeCard({ id: 'local-1', ...SAME_PHRASE, dirty: 0 }))
    const preview = await readBackup(file)

    await restoreBackup({ preview, plan: 'merge', includeNarrations: false, skipDuplicates: true })
    await syncNow('manual')

    const pushed = fakeSupabase.rpcCalls.map((call) => call.args as PushArgs)
    expect(pushed.flatMap((args) => args.p_cards.map((card) => card.id))).toEqual(['file-new'])
    expect(pushed.flatMap((args) => args.p_logs.map((log) => log.id))).toEqual(['log-new'])
    expect((await db.cards.get('local-1'))?.dirty).toBe(0)
  })
})
