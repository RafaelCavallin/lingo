import { z } from 'zod'
import type { AudioEntry } from './backupFormat'
import type { Card, Deck, Hint, ReviewLog } from './db'

/**
 * `dirty` é ignorado na leitura e sempre devolvido como 0: o arquivo descreve
 * conteúdo, nunca estado de sincronização — quem decide o que está pendente
 * de envio é a restauração, como o apply do pull faz com a linha remota.
 */

const range = z.object({ start: z.number(), end: z.number() })

const hint: z.ZodType<Hint> = z.object({
  type: z.enum(['phrasal_verb', 'false_cognate', 'pronunciation', 'custom']),
  text: z.string(),
  source: z.enum(['ai', 'user']),
})

export const deckSchema = z
  .object({
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
  .transform((d): Deck => ({
    ...d,
    fsrsParams: d.fsrsParams ?? undefined,
    paramsOptimizedAt: d.paramsOptimizedAt ?? undefined,
    dirty: 0,
  }))

export const cardSchema = z
  .object({
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
  .transform((c): Card => ({
    ...c,
    phonetic: c.phonetic ?? undefined,
    clozeRanges: c.clozeRanges ?? undefined,
    emphasisRanges: c.emphasisRanges ?? undefined,
    translationEmphasisRanges: c.translationEmphasisRanges ?? undefined,
    lastReview: c.lastReview ?? undefined,
    dirty: 0,
  }))

export const reviewLogSchema = z
  .object({
    id: z.string(),
    cardId: z.string(),
    deckId: z.string(),
    rating: z.enum(['again', 'good']),
    reviewedAt: z.number(),
    stateBefore: z.number(),
    scheduledDays: z.number(),
    durationMs: z.number(),
  })
  .transform((l): ReviewLog => ({ ...l, dirty: 0 }))

export const audioEntrySchema: z.ZodType<AudioEntry> = z.object({
  id: z.string(),
  cardId: z.string(),
  kind: z.enum(['tts', 'user_recording']),
  voice: z.string().nullable(),
  createdAt: z.number(),
  mimeType: z.string(),
  bytes: z.number(),
  sentence: z.string(),
  path: z.string(),
})
