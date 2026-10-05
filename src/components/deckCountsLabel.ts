import type { DeckCardCounts } from '../services/deckCounts'

export function deckCountsLabel(counts: DeckCardCounts): string {
  if (counts.total === 0) return 'Nenhum cartão'
  const parts = [
    `${counts.total} ${counts.total === 1 ? 'cartão' : 'cartões'}`,
    counts.fresh > 0 ? `${counts.fresh} ${counts.fresh === 1 ? 'novo' : 'novos'}` : '',
    counts.learning > 0 ? `${counts.learning} aprendendo` : '',
    counts.review > 0 ? `${counts.review} em revisão` : '',
  ]
  return parts.filter(Boolean).join(' · ')
}
