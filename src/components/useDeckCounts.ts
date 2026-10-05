import { useLiveQuery } from 'dexie-react-hooks'
import { countDeckCards, type DeckCardCounts } from '../services/deckCounts'
import { useLastDefined } from './useLastDefined'

export function useDeckCounts(deckId: string): DeckCardCounts | undefined {
  const counts = useLiveQuery(() => countDeckCards(deckId), [deckId])
  return useLastDefined(counts, deckId).value
}
