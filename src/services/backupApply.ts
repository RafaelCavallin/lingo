import type { EntityTable } from 'dexie'
import { findDuplicatesAgainstLocal } from './backupDuplicates'
import { selectWinners } from './backupPlan'
import { dropUntouchedDefaultDeck, tombstoneOrphans } from './backupTombstones'
import type { RestoreContent, RestorePlan } from './backupTypes'
import { db, type ReviewLog } from './db'
import type { Versioned } from './lww'

export interface ApplyOptions {
  plan: RestorePlan
  skipDuplicates: boolean
}

export interface AppliedRecords {
  decks: number
  cards: number
  reviewLogs: number
  tombstoned: number
  duplicateCardIds: string[]
  skippedLogs: number
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

/** Calculado dentro da transação, não aproveitado da prévia: um sync entre a
 *  prévia e a confirmação pode ter mudado o que é duplicata. Na substituição o
 *  conteúdo local deixa de valer, então não há o que comparar. */
async function splitDuplicates(content: RestoreContent, options: ApplyOptions) {
  const found = options.plan === 'merge' ? await findDuplicatesAgainstLocal(content.cards) : []
  const duplicateCardIds = found.map((card) => card.id)
  const skipped = new Set(options.skipDuplicates ? duplicateCardIds : [])
  return {
    duplicateCardIds,
    cards: content.cards.filter((card) => !skipped.has(card.id)),
    reviewLogs: content.reviewLogs.filter((log) => !skipped.has(log.cardId)),
  }
}

export async function applyRecords(content: RestoreContent, options: ApplyOptions): Promise<AppliedRecords> {
  const now = Date.now()
  const { plan } = options
  return db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
    const kept = await splitDuplicates(content, options)
    await dropUntouchedDefaultDeck(content, now)
    const decks = await applyRows(db.decks, pending(content.decks, plan, now), plan)
    const cards = await applyRows(db.cards, pending(kept.cards, plan, now), plan)
    const reviewLogs = await addMissingLogs(kept.reviewLogs.map((log) => ({ ...log, dirty: 1 })))
    const tombstoned = plan === 'replace' ? await tombstoneOrphans(content, now) : 0
    const skippedLogs = content.reviewLogs.length - kept.reviewLogs.length
    return { decks, cards, reviewLogs, tombstoned, duplicateCardIds: kept.duplicateCardIds, skippedLogs }
  })
}
