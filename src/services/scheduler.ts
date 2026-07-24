import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'
import { db, uid, type Card, type Deck, type ReviewLog } from './db'

let f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))

/** Aplica os parâmetros otimizados sobre o histórico real do usuário. */
export function useParameters(w?: number[]) {
  f = fsrs(
    generatorParameters(
      w && w.length ? { request_retention: 0.9, enable_fuzz: true, w } : { request_retention: 0.9, enable_fuzz: true },
    ),
  )
}

/** Único ponto de tradução entre a UI binária e o algoritmo. */
export type BinaryRating = 'again' | 'good'
const toFsrsRating = (r: BinaryRating) => (r === 'again' ? Rating.Again : Rating.Good)

const DAY = 86_400_000
const YOUNG_STABILITY_DAYS = 21

export function newCard(deckId: string, sentence: string, translation: string, hints: Card['hints']): Card {
  const empty = createEmptyCard(new Date())
  return {
    id: uid(),
    deckId,
    sentence: sentence.trim(),
    translation: translation.trim(),
    hints,
    due: empty.due.getTime(),
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsedDays: empty.elapsed_days,
    scheduledDays: empty.scheduled_days,
    reps: empty.reps,
    lapses: empty.lapses,
    state: empty.state,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Aplica a resposta do usuário. O FSRS deduz a dificuldade do histórico —
 * a UI só informa se lembrou ou não.
 */
export async function answer(card: Card, rating: BinaryRating, durationMs: number): Promise<void> {
  const now = new Date()
  const { card: next } = f.next(
    {
      due: new Date(card.due),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: card.lastReview ? new Date(card.lastReview) : undefined,
    },
    now,
    toFsrsRating(rating),
  )

  const log: ReviewLog = {
    id: uid(),
    cardId: card.id,
    rating,
    reviewedAt: now.getTime(),
    stateBefore: card.state,
    scheduledDays: next.scheduled_days,
    durationMs,
  }

  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.update(card.id, {
      due: next.due.getTime(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsed_days,
      scheduledDays: next.scheduled_days,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      lastReview: now.getTime(),
      updatedAt: now.getTime(),
    })
    await db.reviewLogs.add(log)
  })
}

/** Cartões "young": ainda não consolidados. Base do limite inteligente. */
function isYoung(c: Card): boolean {
  if (c.state === State.Learning || c.state === State.Relearning) return true
  return c.state === State.Review && c.stability < YOUNG_STABILITY_DAYS
}

/**
 * Fila do dia: vencidos primeiro, novos entram apenas na velocidade em que
 * os anteriores são consolidados (equivalente nativo ao "Limit New by Young").
 */
export async function buildQueue(deck: Deck): Promise<Card[]> {
  const all = await db.cards.where('deckId').equals(deck.id).toArray()
  const now = Date.now()

  const due = all
    .filter((c) => c.state !== State.New && c.due <= now)
    .sort((a, b) => a.due - b.due)

  const youngCount = all.filter(isYoung).length
  const introducedToday = await countIntroducedToday(deck.id)

  const roomByYoung = Math.max(0, deck.youngLimit - youngCount)
  const roomByDaily = Math.max(0, deck.newCardsPerDay - introducedToday)
  const room = Math.min(roomByYoung, roomByDaily)

  const fresh = all
    .filter((c) => c.state === State.New)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, room)

  return interleave(due, fresh)
}

async function countIntroducedToday(deckId: string): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const logs = await db.reviewLogs.where('reviewedAt').above(start.getTime()).toArray()
  const firstReviews = logs.filter((l) => l.stateBefore === State.New)
  if (firstReviews.length === 0) return 0
  const ids = new Set(firstReviews.map((l) => l.cardId))
  const cards = await db.cards.bulkGet([...ids])
  return cards.filter((c) => c && c.deckId === deckId).length
}

/** Distribui os novos ao longo da sessão em vez de empilhá-los no fim. */
function interleave(due: Card[], fresh: Card[]): Card[] {
  if (fresh.length === 0) return due
  if (due.length === 0) return fresh
  const out: Card[] = []
  const step = Math.max(1, Math.floor(due.length / fresh.length))
  let fi = 0
  due.forEach((c, i) => {
    out.push(c)
    if (i % step === step - 1 && fi < fresh.length) out.push(fresh[fi++])
  })
  while (fi < fresh.length) out.push(fresh[fi++])
  return out
}

/** Média móvel do tempo por revisão — só para a estimativa da tela inicial. */
export async function estimateMinutes(queueSize: number): Promise<number> {
  const recent = await db.reviewLogs.orderBy('reviewedAt').reverse().limit(50).toArray()
  const fallback = 8000
  const avg = recent.length
    ? recent.reduce((s, l) => s + Math.min(l.durationMs || fallback, 60_000), 0) / recent.length
    : fallback
  return Math.max(1, Math.round((queueSize * avg) / 60_000))
}

export function formatInterval(days: number): string {
  if (days < 1) return 'hoje'
  if (days === 1) return '1 dia'
  if (days < 30) return `${Math.round(days)} dias`
  if (days < 365) return `${Math.round(days / 30)} meses`
  return `${(days / 365).toFixed(1)} anos`
}

export { DAY }
