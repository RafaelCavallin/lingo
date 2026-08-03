import { z } from 'zod'
import type { Card, Deck, Hint, ReviewLog } from './db'

/**
 * Linha remota validada + o `synced_at` que a acompanha (cursor de pull).
 * Uma linha malformada (schema divergente do servidor) é descartada aqui,
 * antes de chegar perto do `bulkPut` que alimenta a fila de estudo.
 */
export interface Parsed<T> {
  row: T
  syncedAt: string
}

const hint: z.ZodType<Hint> = z.object({
  type: z.enum(['phrasal_verb', 'false_cognate', 'pronunciation', 'custom']),
  text: z.string(),
  source: z.enum(['ai', 'user']),
})

const deckRow = z.object({
  id: z.string(),
  name: z.string(),
  new_cards_per_day: z.number(),
  young_limit: z.number(),
  listen_first: z.boolean(),
  voice: z.string(),
  speech_rate: z.number(),
  fsrs_params: z.array(z.number()).nullable(),
  params_optimized_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number(),
  synced_at: z.string(),
})

const cardRow = z.object({
  id: z.string(),
  deck_id: z.string(),
  sentence: z.string(),
  translation: z.string(),
  hints: z.array(hint),
  cloze_ranges: z.array(z.object({ start: z.number(), end: z.number() })).nullable(),
  due: z.number(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_review: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number(),
  synced_at: z.string(),
})

const reviewLogRow = z.object({
  id: z.string(),
  card_id: z.string(),
  deck_id: z.string(),
  rating: z.enum(['again', 'good']),
  reviewed_at: z.number(),
  state_before: z.number(),
  scheduled_days: z.number(),
  duration_ms: z.number(),
  synced_at: z.string(),
})

export function parseDeckRow(raw: unknown): Parsed<Deck> | null {
  const r = deckRow.safeParse(raw)
  if (!r.success) return null
  const d = r.data
  return {
    row: {
      id: d.id,
      name: d.name,
      newCardsPerDay: d.new_cards_per_day,
      youngLimit: d.young_limit,
      listenFirst: d.listen_first,
      voice: d.voice,
      speechRate: d.speech_rate,
      fsrsParams: d.fsrs_params ?? undefined,
      paramsOptimizedAt: d.params_optimized_at ?? undefined,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      deletedAt: d.deleted_at,
      dirty: 0,
    },
    syncedAt: d.synced_at,
  }
}

export function parseCardRow(raw: unknown): Parsed<Card> | null {
  const r = cardRow.safeParse(raw)
  if (!r.success) return null
  const c = r.data
  return {
    row: {
      id: c.id,
      deckId: c.deck_id,
      sentence: c.sentence,
      translation: c.translation,
      hints: c.hints,
      clozeRanges: c.cloze_ranges ?? undefined,
      due: c.due,
      stability: c.stability,
      difficulty: c.difficulty,
      elapsedDays: c.elapsed_days,
      scheduledDays: c.scheduled_days,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state,
      lastReview: c.last_review ?? undefined,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      deletedAt: c.deleted_at,
      dirty: 0,
    } as Card,
    syncedAt: c.synced_at,
  }
}

export function parseReviewLogRow(raw: unknown): Parsed<ReviewLog> | null {
  const r = reviewLogRow.safeParse(raw)
  if (!r.success) return null
  const l = r.data
  return {
    row: {
      id: l.id,
      cardId: l.card_id,
      deckId: l.deck_id,
      rating: l.rating,
      reviewedAt: l.reviewed_at,
      stateBefore: l.state_before,
      scheduledDays: l.scheduled_days,
      durationMs: l.duration_ms,
      dirty: 0,
    } as ReviewLog,
    syncedAt: l.synced_at,
  }
}

// Nenhum destes envia `user_id`, `dirty` ou `synced_at`: o servidor os
// preenche (ou os rejeita, no caso de dirty/synced_at que nem existem na
// tabela do lado de lá).
export function toDeckRow(d: Deck) {
  return {
    id: d.id,
    name: d.name,
    new_cards_per_day: d.newCardsPerDay,
    young_limit: d.youngLimit,
    listen_first: d.listenFirst,
    voice: d.voice,
    speech_rate: d.speechRate,
    fsrs_params: d.fsrsParams ?? null,
    params_optimized_at: d.paramsOptimizedAt ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
  }
}

export function toCardRow(c: Card) {
  return {
    id: c.id,
    deck_id: c.deckId,
    sentence: c.sentence,
    translation: c.translation,
    hints: c.hints,
    cloze_ranges: c.clozeRanges ?? null,
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsedDays,
    scheduled_days: c.scheduledDays,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  }
}

export function toLogRow(l: ReviewLog) {
  return {
    id: l.id,
    card_id: l.cardId,
    deck_id: l.deckId,
    rating: l.rating,
    reviewed_at: l.reviewedAt,
    state_before: l.stateBefore,
    scheduled_days: l.scheduledDays,
    duration_ms: l.durationMs,
  }
}
