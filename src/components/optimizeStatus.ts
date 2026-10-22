import type { DeckParametersInfo } from '../services/fsrsConfig'
import type { OptimizerProgress } from '../services/optimizerProgress'

const LOCALE = 'pt-BR'
const PERCENT = 100

function dateLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(LOCALE)
}

function sourceLabel(info: DeckParametersInfo): string {
  const date = info.optimizedAt === null ? '' : ` em ${dateLabel(info.optimizedAt)}`
  if (info.source === 'optimized') return `parâmetros otimizados${date}`
  if (info.source === 'legacy') return `parâmetros de uma versão anterior do FSRS${date}: otimize de novo`
  return 'parâmetros padrão'
}

export function parametersStatusText(input: {
  info: DeckParametersInfo
  reviews: number
  minReviews: number
}): string {
  const { info, reviews, minReviews } = input
  return [
    info.fsrsVersion,
    sourceLabel(info),
    `${reviews} revisões acumuladas`,
    `mínimo de ${minReviews}`,
  ].join(' · ')
}

export function optimizeProgressText(input: { progress: OptimizerProgress | null; elapsedS: number }): string {
  const { progress, elapsedS } = input
  const elapsed = `${elapsedS}s`
  if (!progress) return `calculando… · ${elapsed}`
  const pct = Math.round((progress.processed / progress.total) * PERCENT)
  const items = `${progress.processed.toLocaleString(LOCALE)} de ${progress.total.toLocaleString(LOCALE)} itens`
  return `${pct}% · ${items} · ${elapsed}`
}
