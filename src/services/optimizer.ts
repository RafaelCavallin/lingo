import { db, liveCards, type Deck } from './db'
import { isValidOptimizedParameters } from './fsrsConfig'
import { toTrainingItems, type TimedRating } from './optimizerHistory'
import { applyFsrsParameters } from './scheduler'
import { computeInWorker, type ComputeOptions } from './optimizerWorker'
import type { OptimizeRequest } from '../workers/optimizer.worker'

/** Abaixo disto o resultado é ruído: os parâmetros padrão são melhores. */
export const MIN_REVIEWS = 400

export class NotEnoughData extends Error {}

export const INVALID_PARAMETERS_MESSAGE =
  'O otimizador devolveu parâmetros inválidos. Nada foi alterado.'

export async function reviewCount(deckId: string): Promise<number> {
  return db.reviewLogs.where('deckId').equals(deckId).count()
}

/** As notas de cada cartão do deck, em ordem cronológica. */
async function historiesByCard(deck: Deck): Promise<TimedRating[][]> {
  const cards = await liveCards(deck.id).toArray()
  const ids = new Set(cards.map((c) => c.id))
  const logs = (await db.reviewLogs.orderBy('reviewedAt').toArray()).filter((l) => ids.has(l.cardId))
  const byCard = new Map<string, TimedRating[]>()
  for (const l of logs) {
    const list = byCard.get(l.cardId) ?? []
    list.push({ rating: l.rating === 'again' ? 1 : 3, at: l.reviewedAt })
    byCard.set(l.cardId, list)
  }
  return [...byCard.values()]
}

async function buildHistory(deck: Deck): Promise<OptimizeRequest> {
  // Sequências de uma revisão só não informam nada sobre esquecimento.
  const histories = (await historiesByCard(deck)).filter((history) => history.length > 1)
  const total = histories.reduce((sum, history) => sum + history.length, 0)
  if (total < MIN_REVIEWS) {
    throw new NotEnoughData(
      `São necessárias ao menos ${MIN_REVIEWS} revisões para otimizar. Você tem ${total}.`,
    )
  }
  return toTrainingItems(histories)
}

export type OptimizeOptions = ComputeOptions

/**
 * Reaprende os parâmetros do FSRS a partir do seu histórico e passa a usá-los.
 * O agendamento dos cartões existentes não é reescrito: os novos intervalos
 * valem a partir da próxima revisão de cada um.
 */
export async function optimize(deck: Deck, options: OptimizeOptions = {}): Promise<number[]> {
  const request = await buildHistory(deck)
  const worker = new Worker(new URL('../workers/optimizer.worker.ts', import.meta.url), {
    type: 'module',
  })
  try {
    options.onProgress?.(null)
    const parameters = await computeInWorker(worker, request, options)
    if (!isValidOptimizedParameters(parameters)) {
      throw new Error(INVALID_PARAMETERS_MESSAGE)
    }
    await db.decks.update(deck.id, {
      fsrsParams: parameters,
      paramsOptimizedAt: Date.now(),
      updatedAt: Date.now(),
    })
    applyFsrsParameters(parameters)
    return parameters
  } finally {
    worker.terminate()
  }
}
