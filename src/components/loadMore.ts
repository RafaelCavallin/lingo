export const CARDS_PAGE_SIZE = 100

const NUMBER_LOCALE = 'pt-BR'

type LoadMoreProgress = {
  shown: number
  total: number
}

type NextVisibleCountInput = {
  visible: number
  total: number
  step: number
}

export function nextVisibleCount({ visible, total, step }: NextVisibleCountInput): number {
  return Math.min(visible + step, total)
}

export function loadMoreLabel({ shown, total }: LoadMoreProgress): string {
  return `Mostrando ${formatCount(Math.min(shown, total))} de ${formatCount(total)}`
}

export function loadMoreButtonText({ shown, total }: LoadMoreProgress): string {
  const next = Math.min(CARDS_PAGE_SIZE, total - shown)
  return `Carregar mais ${formatCount(next)}`
}

function formatCount(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE)
}
