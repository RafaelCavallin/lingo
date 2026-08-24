import { vi } from 'vitest'
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

/**
 * jsdom não implementa URL.createObjectURL, e trocar o `URL` global inteiro
 * quebra o `new URL()` que o próprio Vite usa. Só os dois métodos são postos
 * no lugar, e a função devolve como desfazer.
 */
export function stubObjectUrl(url = 'blob:fake') {
  const revokeObjectURL = vi.fn()
  const original = {
    create: URL.createObjectURL.bind(URL),
    revoke: URL.revokeObjectURL.bind(URL),
  }
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => url })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  const restore = () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: original.create })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: original.revoke })
  }
  return { revokeObjectURL, restore }
}
