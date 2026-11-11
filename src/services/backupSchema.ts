import { z } from 'zod'
import { HINT_TYPES, type Card, type Deck, type Hint, type ReviewLog } from './db'

/**
 * `dirty` é ignorado na leitura e sempre devolvido como 0: o arquivo descreve
 * conteúdo, nunca estado de sincronização — quem decide o que está pendente
 * de envio é a restauração, como o apply do pull faz com a linha remota.
 */

const range = z.object({ start: z.number(), end: z.number() })

const hint: z.ZodType<Hint> = z.object({
  type: z.enum(HINT_TYPES),
  text: z.string(),
  source: z.enum(['ai', 'user']),
})

export const deckFields = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  newCardsPerDay: z.number(),
  youngLimit: z.number(),
  updatedAt: z.number(),
  listenFirst: z.boolean(),
  voice: z.string(),
  speechRate: z.number(),
  fsrsParams: z.array(z.number()).nullish(),
  paramsOptimizedAt: z.number().nullish(),
  deletedAt: z.number(),
})

export const deckSchema = deckFields.transform((d): Deck => ({
  ...d,
  fsrsParams: d.fsrsParams ?? undefined,
  paramsOptimizedAt: d.paramsOptimizedAt ?? undefined,
  dirty: 0,
}))

export const cardFields = z.object({
  id: z.string(),
  deckId: z.string(),
  sentence: z.string(),
  translation: z.string(),
  phonetic: z.string().nullish(),
  hints: z.array(hint),
  clozeRanges: z.array(range).nullish(),
  emphasisRanges: z.array(range).nullish(),
  translationEmphasisRanges: z.array(range).nullish(),
  due: z.number(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  lastReview: z.number().nullish(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number(),
})

export const cardSchema = cardFields.transform((c): Card => ({
  ...c,
  phonetic: c.phonetic ?? undefined,
  clozeRanges: c.clozeRanges ?? undefined,
  emphasisRanges: c.emphasisRanges ?? undefined,
  translationEmphasisRanges: c.translationEmphasisRanges ?? undefined,
  lastReview: c.lastReview ?? undefined,
  dirty: 0,
}))

export const reviewLogFields = z.object({
  id: z.string(),
  cardId: z.string(),
  deckId: z.string(),
  rating: z.enum(['again', 'good']),
  reviewedAt: z.number(),
  stateBefore: z.number(),
  scheduledDays: z.number(),
  durationMs: z.number(),
})

export const reviewLogSchema = reviewLogFields.transform((l): ReviewLog => ({ ...l, dirty: 0 }))
