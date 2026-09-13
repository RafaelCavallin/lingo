import type { EntityTable } from 'dexie'
import { isUntouchedDefaultDeck } from './auth'
import { selectOrphans, selectWinners } from './backupPlan'
import { db, type Card, type Deck, type ReviewLog } from './db'
import type { Versioned } from './lww'

export type RestorePlan = 'merge' | 'replace'

export interface RestoreContent {
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
}

export interface AppliedRecords {
  decks: number
  cards: number
  reviewLogs: number
  tombstoned: number
}

/**
 * Substituir grava o arquivo por cima, sem consultar o last-write-wins, e
 * carimba `updatedAt` com o agora: sem isso um registro do arquivo mais antigo
 * que o local perderia no servidor durante o push, e o pull seguinte desfaria
 * a substituição que o usuário acabou de pedir.
 */
async function applyRows<T extends Versioned & { id: string }>(
  table: EntityTable<T, 'id'> & { bulkGet(ids: string[]): Promise<(T | undefined)[]> },
  rows: T[],
  plan: RestorePlan,
): Promise<number> {
  if (rows.length === 0) return 0
  if (plan === 'replace') {
    await table.bulkPut(rows)
    return rows.length
  }
  const local = await table.bulkGet(rows.map((row) => row.id))
  const winners = selectWinners({ incoming: rows, local })
  if (winners.length > 0) await table.bulkPut(winners)
  return winners.length
}

/** Revisões são imutáveis: união por id, nunca sobrescreve o que já existe. */
async function addMissingLogs(incoming: ReviewLog[]): Promise<number> {
  if (incoming.length === 0) return 0
  const local = await db.reviewLogs.bulkGet(incoming.map((log) => log.id))
  const fresh = incoming.filter((_, index) => !local[index])
  if (fresh.length > 0) await db.reviewLogs.bulkAdd(fresh)
  return fresh.length
}

function pending<T extends Versioned>(rows: T[], plan: RestorePlan, now: number): T[] {
  if (plan === 'merge') return rows.map((row) => ({ ...row, dirty: 1 as const }))
  return rows.map((row) => ({ ...row, dirty: 1 as const, updatedAt: now }))
}

async function tombstoneOrphans(content: RestoreContent, now: number): Promise<number> {
  const [localDecks, localCards] = await Promise.all([
    db.decks.filter((deck) => deck.deletedAt === 0).primaryKeys(),
    db.cards.filter((card) => card.deletedAt === 0).primaryKeys(),
  ])
  const deckIds = selectOrphans({ localIds: localDecks, incomingIds: content.decks.map((d) => d.id) })
  const cardIds = selectOrphans({ localIds: localCards, incomingIds: content.cards.map((c) => c.id) })
  const tombstone = { deletedAt: now, updatedAt: now, dirty: 1 as const }
  await db.decks.where('id').anyOf(deckIds).modify(tombstone)
  await db.cards.where('id').anyOf(cardIds).modify(tombstone)
  return deckIds.length + cardIds.length
}

/**
 * O baralho semeado na primeira abertura não é dado do usuário: mantê-lo ao
 * lado do que veio do arquivo deixaria o aparelho com um baralho vazio
 * homônimo — e, pior, com ele ainda selecionado, dando a impressão de que a
 * restauração não trouxe nada. Mesmo tratamento que a entrada em uma conta dá.
 *
 * Tombstone, não `bulkDelete`: se este baralho já tiver subido ao servidor
 * (um sync no boot pode correr antes do usuário abrir a restauração), apagar
 * sem marcar `dirty` nunca chegaria ao servidor, e o baralho vazio voltaria
 * no próximo pull — o mesmo baralho homônimo que isto existe para evitar.
 *
 * Roda dentro da transação da restauração: fora dela, a interface enxerga o
 * instante sem baralho nenhum, cai na tela de "nenhum baralho" e desmonta a
 * própria tela de restauração no meio da operação.
 */
async function dropUntouchedDefaultDeck(content: RestoreContent, now: number): Promise<void> {
  if (content.decks.length === 0) return
  if (!(await isUntouchedDefaultDeck())) return
  const ids = await db.decks.filter((deck) => deck.deletedAt === 0).primaryKeys()
  const seeded = ids.filter((id) => !content.decks.some((deck) => deck.id === id))
  await db.decks.where('id').anyOf(seeded).modify({ deletedAt: now, updatedAt: now, dirty: 1 })
}

export async function applyRecords(content: RestoreContent, plan: RestorePlan): Promise<AppliedRecords> {
  const now = Date.now()
  return db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
    await dropUntouchedDefaultDeck(content, now)
    const decks = await applyRows(db.decks, pending(content.decks, plan, now), plan)
    const cards = await applyRows(db.cards, pending(content.cards, plan, now), plan)
    const reviewLogs = await addMissingLogs(content.reviewLogs.map((log) => ({ ...log, dirty: 1 })))
    const tombstoned = plan === 'replace' ? await tombstoneOrphans(content, now) : 0
    return { decks, cards, reviewLogs, tombstoned }
  })
}
