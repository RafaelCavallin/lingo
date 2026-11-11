import type { DuplicateSummary } from './backupTypes'
import { db, liveCards, type Card } from './db'

const KEY_SEPARATOR = '\u0000'
const WHITESPACE = /\s+/g
const TRAILING_PUNCTUATION = /[.!?…,;:]+$/

export type DuplicateCandidate = Pick<Card, 'id' | 'deckId' | 'sentence' | 'translation' | 'clozeRanges'>

export function normalizeText(text: string): string {
  const collapsed = text.trim().toLowerCase().replace(WHITESPACE, ' ')
  return collapsed.replace(TRAILING_PUNCTUATION, '').trim()
}

/** Compara o texto oculto, não os offsets: espaços e caixa diferentes
 *  deslocariam os offsets de um cartão que é, na prática, o mesmo. */
function hiddenWords(card: DuplicateCandidate): string[] {
  const ranges = [...(card.clozeRanges ?? [])].sort((a, b) => a.start - b.start)
  return ranges.map((range) => normalizeText(card.sentence.slice(range.start, range.end)))
}

export function duplicateKey(card: DuplicateCandidate): string {
  const parts = [card.deckId, normalizeText(card.sentence), normalizeText(card.translation), ...hiddenWords(card)]
  return parts.join(KEY_SEPARATOR)
}

export function findDuplicateIds(input: { incoming: DuplicateCandidate[]; local: DuplicateCandidate[] }): string[] {
  const known = new Set(input.local.map(duplicateKey))
  return input.incoming.filter((card) => known.has(duplicateKey(card))).map((card) => card.id)
}

/** Só concorre a duplicata o cartão vivo do arquivo cujo id o aparelho não
 *  conhece — nem vivo, nem excluído: com o mesmo id vale a regra de recência. */
async function unknownLiveCards(incoming: Card[]): Promise<Card[]> {
  const live = incoming.filter((card) => card.deletedAt === 0)
  const stored = await db.cards.bulkGet(live.map((card) => card.id))
  return live.filter((_, index) => !stored[index])
}

async function liveCardsOfDecks(deckIds: string[]): Promise<Card[]> {
  const perDeck = await Promise.all(deckIds.map((deckId) => liveCards(deckId).toArray()))
  return perDeck.flat()
}

/** Ids do arquivo que repetem um cartão vivo do aparelho, no mesmo baralho. */
export async function findDuplicatesAgainstLocal(incoming: Card[]): Promise<Card[]> {
  const eligible = await unknownLiveCards(incoming)
  if (eligible.length === 0) return []
  const local = await liveCardsOfDecks([...new Set(eligible.map((card) => card.deckId))])
  const duplicateIds = new Set(findDuplicateIds({ incoming: eligible, local }))
  return eligible.filter((card) => duplicateIds.has(card.id))
}

export async function summarizeDuplicates(incoming: Card[]): Promise<DuplicateSummary> {
  const duplicates = await findDuplicatesAgainstLocal(incoming)
  const decks = await db.decks.bulkGet([...new Set(duplicates.map((card) => card.deckId))])
  const names = new Map(decks.flatMap((deck) => (deck ? [[deck.id, deck.name] as const] : [])))
  return {
    cardIds: duplicates.map((card) => card.id),
    items: duplicates.map((card) => ({ sentence: card.sentence, deckName: names.get(card.deckId) ?? '' })),
  }
}
