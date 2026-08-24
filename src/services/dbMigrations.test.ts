import { afterEach, describe, expect, it } from 'vitest'

/**
 * As migrations só rodam ao abrir um banco de versão anterior, então este
 * arquivo monta a versão 1 na mão, com a IndexedDB crua, e só depois toca no
 * módulo do Dexie — que ao abrir aplica os upgrades da v2 à v4.
 */
const V1_STORES: Record<string, string[]> = {
  decks: ['name', 'createdAt'],
  cards: ['deckId', 'due', 'state', 'createdAt'],
  reviewLogs: ['cardId', 'reviewedAt'],
  audioBlobs: ['cardId', 'kind'],
}

function seedVersion1(rows: Record<string, unknown[]>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lingo', 1)
    request.onupgradeneeded = () => {
      for (const [name, indexes] of Object.entries(V1_STORES)) {
        const store = request.result.createObjectStore(name, { keyPath: 'id' })
        for (const index of indexes) store.createIndex(index, index)
      }
    }
    request.onerror = () => reject(new Error(`falha ao abrir a v1: ${String(request.error)}`))
    request.onsuccess = () => {
      const idb = request.result
      const tx = idb.transaction(Object.keys(rows), 'readwrite')
      for (const [table, items] of Object.entries(rows)) {
        for (const item of items) tx.objectStore(table).put(item)
      }
      tx.oncomplete = () => {
        idb.close()
        resolve()
      }
      tx.onerror = () => reject(new Error(`falha ao semear a v1: ${String(tx.error)}`))
    }
  })
}

afterEach(async () => {
  const { db } = await import('./db')
  db.close()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('lingo')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
})

describe('migrations do banco local', () => {
  it('preenche os campos novos ao subir da versão 1 para a atual', async () => {
    await seedVersion1({
      decks: [{ id: 'd1', name: 'Inglês', createdAt: 1000, newCardsPerDay: 20, youngLimit: 50 }],
      cards: [
        { id: 'c1', deckId: 'd1', sentence: 'Hello', createdAt: 1000, lastReview: 1500 },
        { id: 'c2', deckId: 'd1', sentence: 'There', createdAt: 900 },
      ],
      reviewLogs: [{ id: 'l1', cardId: 'c1', rating: 'good', reviewedAt: 1200 }],
    })

    const { db, DEFAULT_VOICE, DEFAULT_RATE } = await import('./db')
    await db.open()

    const deck = (await db.decks.get('d1'))!
    expect(deck.listenFirst).toBe(false)
    expect(deck.voice).toBe(DEFAULT_VOICE)
    expect(deck.speechRate).toBe(DEFAULT_RATE)
    expect(deck.updatedAt).toBeGreaterThan(0)

    const comRevisao = (await db.cards.get('c1'))!
    const semRevisao = (await db.cards.get('c2'))!
    expect(comRevisao.updatedAt).toBe(1500)
    expect(semRevisao.updatedAt).toBe(900)
  })

  it('marca tudo como limpo e vivo, para não empurrar o banco inteiro no primeiro sync', async () => {
    await seedVersion1({
      decks: [{ id: 'd1', name: 'Inglês', createdAt: 1000 }],
      cards: [{ id: 'c1', deckId: 'd1', sentence: 'Hello', createdAt: 1000 }],
      reviewLogs: [{ id: 'l1', cardId: 'c1', rating: 'good', reviewedAt: 1200 }],
    })

    const { db } = await import('./db')
    await db.open()

    expect((await db.decks.get('d1'))!.dirty).toBe(0)
    expect((await db.decks.get('d1'))!.deletedAt).toBe(0)
    expect((await db.cards.get('c1'))!.dirty).toBe(0)
    expect((await db.cards.get('c1'))!.deletedAt).toBe(0)
    expect((await db.reviewLogs.get('l1'))!.dirty).toBe(0)
  })

  it('denormaliza o deck nos logs a partir do cartão que cada um revisou', async () => {
    await seedVersion1({
      decks: [{ id: 'd1', name: 'Inglês', createdAt: 1000 }],
      cards: [{ id: 'c1', deckId: 'd1', sentence: 'Hello', createdAt: 1000 }],
      reviewLogs: [
        { id: 'l1', cardId: 'c1', rating: 'good', reviewedAt: 1200 },
        { id: 'l2', cardId: 'sumiu', rating: 'again', reviewedAt: 1300 },
      ],
    })

    const { db } = await import('./db')
    await db.open()

    expect((await db.reviewLogs.get('l1'))!.deckId).toBe('d1')
    expect((await db.reviewLogs.get('l2'))!.deckId).toBe('')
  })
})
