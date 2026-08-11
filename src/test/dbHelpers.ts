import { db } from '../services/db'

/** fake-indexeddb mantém estado entre testes no mesmo processo — chamar em afterEach. */
export async function resetDb(): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.reviewLogs, db.audioBlobs, db.syncState, async () => {
    await db.decks.clear()
    await db.cards.clear()
    await db.reviewLogs.clear()
    await db.audioBlobs.clear()
    await db.syncState.clear()
  })
}
