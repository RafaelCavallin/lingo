import type { DeckCardCounts } from '../services/deckCounts'
import { deckCountsLabel } from './deckCountsLabel'
import { Skeleton } from './Skeleton'

export function DeckCountsText({ counts }: { counts: DeckCardCounts | undefined }) {
  if (!counts) return <Skeleton shape="text" width="12rem" height="1rem" className="mt-1" />
  return <p className="mt-1 text-sm text-muted">{deckCountsLabel(counts)}</p>
}
