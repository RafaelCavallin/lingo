import { isUntouchedDefaultDeck } from './auth'
import { selectOrphans } from './backupPlan'
import type { RestoreContent } from './backupTypes'
import { db } from './db'

export async function tombstoneOrphans(content: RestoreContent, now: number): Promise<number> {
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
export async function dropUntouchedDefaultDeck(content: RestoreContent, now: number): Promise<void> {
  if (content.decks.length === 0) return
  if (!(await isUntouchedDefaultDeck())) return
  const ids = await db.decks.filter((deck) => deck.deletedAt === 0).primaryKeys()
  const seeded = ids.filter((id) => !content.decks.some((deck) => deck.id === id))
  await db.decks.where('id').anyOf(seeded).modify({ deletedAt: now, updatedAt: now, dirty: 1 })
}
