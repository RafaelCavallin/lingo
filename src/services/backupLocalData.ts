import { isUntouchedDefaultDeck } from './auth'
import { db } from './db'

/** Há algo no aparelho que uma mesclagem poderia pôr em risco? O baralho
 *  semeado na primeira abertura não conta: não é dado do usuário. */
export async function hasLocalData(): Promise<boolean> {
  if (await isUntouchedDefaultDeck()) return false
  const [decks, cards, reviewLogs] = await Promise.all([
    db.decks.where('deletedAt').equals(0).count(),
    db.cards.where('deletedAt').equals(0).count(),
    db.reviewLogs.count(),
  ])
  return decks + cards + reviewLogs > 0
}
