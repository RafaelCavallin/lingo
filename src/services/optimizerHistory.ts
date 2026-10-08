import type { OptimizeRequest } from '../workers/optimizer.worker'

const DAY_MS = 86_400_000

export interface TimedRating {
  rating: number
  at: number
}

interface Review {
  rating: number
  deltaT: number
}

function withDeltas(history: TimedRating[]): Review[] {
  return history.map((review, i) => ({
    rating: review.rating,
    deltaT: i === 0 ? 0 : Math.max(0, Math.round((review.at - history[i - 1].at) / DAY_MS)),
  }))
}

/**
 * O fsrs-browser treina prevendo a última revisão de cada sequência, então cada
 * revisão feita em outro dia vira uma sequência própria com tudo o que veio antes.
 * Sequências terminadas no mesmo dia da anterior derrubam o wasm.
 */
function trainingSequences(reviews: Review[]): Review[][] {
  return reviews
    .map((_, end) => reviews.slice(0, end + 1))
    .filter((sequence) => sequence.length > 1 && sequence[sequence.length - 1].deltaT > 0)
}

export function toTrainingItems(histories: TimedRating[][]): OptimizeRequest {
  const request: OptimizeRequest = { ratings: [], deltaTs: [], lengths: [] }
  for (const sequence of histories.flatMap((history) => trainingSequences(withDeltas(history)))) {
    request.lengths.push(sequence.length)
    for (const review of sequence) {
      request.ratings.push(review.rating)
      request.deltaTs.push(review.deltaT)
    }
  }
  return request
}
