import { db, type Deck } from './db'
import { useParameters } from './scheduler'
import type { OptimizeRequest, OptimizeResponse } from '../workers/optimizer.worker'

/** Abaixo disto o resultado é ruído: os parâmetros padrão são melhores. */
export const MIN_REVIEWS = 400

export class NotEnoughData extends Error {}

export async function reviewCount(): Promise<number> {
  return db.reviewLogs.count()
}

/**
 * Monta o histórico no formato do otimizador: as notas de cada cartão em ordem,
 * com o intervalo em dias desde a revisão anterior daquele mesmo cartão.
 */
async function buildHistory(deck: Deck): Promise<OptimizeRequest> {
  const cards = await db.cards.where('deckId').equals(deck.id).toArray()
  const ids = new Set(cards.map((c) => c.id))
  const logs = (await db.reviewLogs.orderBy('reviewedAt').toArray()).filter((l) => ids.has(l.cardId))

  const byCard = new Map<string, { rating: number; at: number }[]>()
  for (const l of logs) {
    const list = byCard.get(l.cardId) ?? []
    list.push({ rating: l.rating === 'again' ? 1 : 3, at: l.reviewedAt })
    byCard.set(l.cardId, list)
  }

  const ratings: number[] = []
  const deltaTs: number[] = []
  const lengths: number[] = []
  const DAY = 86_400_000

  for (const history of byCard.values()) {
    // Sequências de uma revisão só não informam nada sobre esquecimento.
    if (history.length < 2) continue
    lengths.push(history.length)
    history.forEach((h, i) => {
      ratings.push(h.rating)
      deltaTs.push(i === 0 ? 0 : Math.max(0, Math.round((h.at - history[i - 1].at) / DAY)))
    })
  }

  if (ratings.length < MIN_REVIEWS) {
    throw new NotEnoughData(
      `São necessárias ao menos ${MIN_REVIEWS} revisões para otimizar. Você tem ${ratings.length}.`,
    )
  }

  return { ratings, deltaTs, lengths }
}

/**
 * Reaprende os parâmetros do FSRS a partir do seu histórico e passa a usá-los.
 * O agendamento dos cartões existentes não é reescrito: os novos intervalos
 * valem a partir da próxima revisão de cada um.
 */
export async function optimize(deck: Deck): Promise<number[]> {
  const request = await buildHistory(deck)

  const worker = new Worker(new URL('../workers/optimizer.worker.ts', import.meta.url), {
    type: 'module',
  })

  try {
    const parameters = await new Promise<number[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('O otimizador demorou demais.')), 180_000)
      worker.onmessage = (e: MessageEvent<OptimizeResponse>) => {
        clearTimeout(timeout)
        e.data.ok ? resolve(e.data.parameters) : reject(new Error(e.data.error))
      }
      worker.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('O otimizador não pôde ser carregado.'))
      }
      worker.postMessage(request)
    })

    await db.decks.update(deck.id, {
      fsrsParams: parameters,
      paramsOptimizedAt: Date.now(),
      updatedAt: Date.now(),
    })
    useParameters(parameters)
    return parameters
  } finally {
    worker.terminate()
  }
}
