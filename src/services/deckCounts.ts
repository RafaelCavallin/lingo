import { State } from 'ts-fsrs'
import { liveCards } from './db'

export interface DeckCardCounts {
  total: number
  fresh: number
  learning: number
  review: number
}

export async function countDeckCards(deckId: string): Promise<DeckCardCounts> {
  const counts: DeckCardCounts = { total: 0, fresh: 0, learning: 0, review: 0 }
  await liveCards(deckId).each((card) => {
    counts.total++
    if (card.state === State.New) counts.fresh++
    else if (card.state === State.Review) counts.review++
    else counts.learning++
  })
  return counts
}
