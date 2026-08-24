import { describe, expect, it } from 'vitest'
import type { Card, Deck, ReviewLog } from './db'
import { parseCardRow, parseDeckRow, parseReviewLogRow, toCardRow, toDeckRow, toLogRow } from './syncRows'

function validDeckRow() {
  return {
    id: 'deck-1',
    name: 'Frases em inglês',
    new_cards_per_day: 20,
    young_limit: 50,
    listen_first: false,
    voice: 'nova',
    speech_rate: 1,
    fsrs_params: null,
    params_optimized_at: null,
    created_at: 1000,
    updated_at: 2000,
    deleted_at: 0,
    synced_at: '2026-01-01T00:00:00Z',
  }
}

function validCardRow() {
  return {
    id: 'card-1',
    deck_id: 'deck-1',
    sentence: 'Hello there',
    translation: 'Olá',
    phonetic: null,
    hints: [],
    cloze_ranges: null,
    emphasis_ranges: null,
    translation_emphasis_ranges: null,
    due: 1000,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
    created_at: 1000,
    updated_at: 2000,
    deleted_at: 0,
    synced_at: '2026-01-01T00:00:00Z',
  }
}

function validReviewLogRow() {
  return {
    id: 'log-1',
    card_id: 'card-1',
    deck_id: 'deck-1',
    rating: 'good' as const,
    reviewed_at: 1000,
    state_before: 0,
    scheduled_days: 1,
    duration_ms: 500,
    synced_at: '2026-01-01T00:00:00Z',
  }
}

describe('parseDeckRow', () => {
  it('converts a valid row to camelCase with dirty:0', () => {
    const parsed = parseDeckRow(validDeckRow())
    expect(parsed).not.toBeNull()
    expect(parsed!.row).toMatchObject({
      id: 'deck-1',
      name: 'Frases em inglês',
      newCardsPerDay: 20,
      youngLimit: 50,
      listenFirst: false,
      voice: 'nova',
      speechRate: 1,
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 0,
      dirty: 0,
    })
    expect(parsed!.syncedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('maps nullable fsrs_params/params_optimized_at to undefined', () => {
    const parsed = parseDeckRow(validDeckRow())!
    expect(parsed.row.fsrsParams).toBeUndefined()
    expect(parsed.row.paramsOptimizedAt).toBeUndefined()
  })

  it('keeps fsrs_params/params_optimized_at when present', () => {
    const raw = { ...validDeckRow(), fsrs_params: [1, 2, 3], params_optimized_at: 5000 }
    const parsed = parseDeckRow(raw)!
    expect(parsed.row.fsrsParams).toEqual([1, 2, 3])
    expect(parsed.row.paramsOptimizedAt).toBe(5000)
  })

  it('returns null for a malformed row', () => {
    const { name: _name, ...withoutName } = validDeckRow()
    expect(parseDeckRow(withoutName)).toBeNull()
    expect(parseDeckRow({ ...validDeckRow(), created_at: 'not-a-number' })).toBeNull()
    expect(parseDeckRow(null)).toBeNull()
  })
})

describe('parseCardRow', () => {
  it('converts a valid row to camelCase with dirty:0', () => {
    const parsed = parseCardRow(validCardRow())
    expect(parsed).not.toBeNull()
    expect(parsed!.row).toMatchObject({
      id: 'card-1',
      deckId: 'deck-1',
      sentence: 'Hello there',
      translation: 'Olá',
      dirty: 0,
    })
  })

  it('maps nullable cloze_ranges/last_review to undefined, and keeps them when present', () => {
    const parsed = parseCardRow(validCardRow())!
    expect(parsed.row.clozeRanges).toBeUndefined()
    expect(parsed.row.lastReview).toBeUndefined()

    const raw = { ...validCardRow(), cloze_ranges: [{ start: 0, end: 5 }], last_review: 1500 }
    const withValues = parseCardRow(raw)!
    expect(withValues.row.clozeRanges).toEqual([{ start: 0, end: 5 }])
    expect(withValues.row.lastReview).toBe(1500)
  })

  it('returns null for a malformed row', () => {
    expect(parseCardRow({ ...validCardRow(), hints: 'not-an-array' })).toBeNull()
  })

  it('faz ida e volta dos destaques', () => {
    const parsed = parseCardRow(validCardRow())!
    expect(parsed.row.emphasisRanges).toBeUndefined()
    expect(parsed.row.translationEmphasisRanges).toBeUndefined()

    const raw = {
      ...validCardRow(),
      emphasis_ranges: [{ start: 0, end: 5 }],
      translation_emphasis_ranges: [{ start: 1, end: 3 }],
    }
    const withValues = parseCardRow(raw)!
    expect(withValues.row.emphasisRanges).toEqual([{ start: 0, end: 5 }])
    expect(withValues.row.translationEmphasisRanges).toEqual([{ start: 1, end: 3 }])
    expect(toCardRow(withValues.row).emphasis_ranges).toEqual([{ start: 0, end: 5 }])
    expect(toCardRow(withValues.row).translation_emphasis_ranges).toEqual([{ start: 1, end: 3 }])
  })

  // Servidor ainda sem a migration da ênfase: as colunas nem vêm na linha, e
  // isso não pode derrubar o cartão inteiro no parse.
  it('aceita a linha sem as colunas de destaque', () => {
    const { emphasis_ranges, translation_emphasis_ranges, ...row } = validCardRow()
    void emphasis_ranges
    void translation_emphasis_ranges
    const parsed = parseCardRow(row)
    expect(parsed).not.toBeNull()
    expect(parsed!.row.emphasisRanges).toBeUndefined()
  })

  it('faz ida e volta da fonética, e trata vazio como null no envio', () => {
    expect(parseCardRow(validCardRow())!.row.phonetic).toBeUndefined()

    const parsed = parseCardRow({ ...validCardRow(), phonetic: 'ˈbərd(ə)n' })!
    expect(parsed.row.phonetic).toBe('ˈbərd(ə)n')
    expect(toCardRow(parsed.row).phonetic).toBe('ˈbərd(ə)n')

    expect(toCardRow(parseCardRow(validCardRow())!.row).phonetic).toBeNull()
  })
})

describe('parseReviewLogRow', () => {
  it('converts a valid row to camelCase with dirty:0', () => {
    const parsed = parseReviewLogRow(validReviewLogRow())
    expect(parsed).not.toBeNull()
    expect(parsed!.row).toMatchObject({
      id: 'log-1',
      cardId: 'card-1',
      deckId: 'deck-1',
      rating: 'good',
      dirty: 0,
    })
  })

  it('returns null for an invalid rating', () => {
    expect(parseReviewLogRow({ ...validReviewLogRow(), rating: 'meh' })).toBeNull()
  })
})

describe('toDeckRow / toCardRow / toLogRow', () => {
  it('produces snake_case shapes without leaking dirty/user_id/synced_at', () => {
    const deck: Deck = {
      id: 'deck-1',
      name: 'Frases em inglês',
      createdAt: 1000,
      newCardsPerDay: 20,
      youngLimit: 50,
      updatedAt: 2000,
      listenFirst: false,
      voice: 'nova',
      speechRate: 1,
      deletedAt: 0,
      dirty: 1,
    }
    const row = toDeckRow(deck) as Record<string, unknown>
    expect(row.new_cards_per_day).toBe(20)
    expect(row.young_limit).toBe(50)
    expect(row.fsrs_params).toBeNull()
    expect(row).not.toHaveProperty('dirty')
    expect(row).not.toHaveProperty('user_id')
    expect(row).not.toHaveProperty('synced_at')

    const card: Card = {
      id: 'card-1',
      deckId: 'deck-1',
      sentence: 'Hello there',
      translation: 'Olá',
      hints: [],
      due: 1000,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 0,
      dirty: 1,
    }
    const cardRow = toCardRow(card) as Record<string, unknown>
    expect(cardRow.deck_id).toBe('deck-1')
    expect(cardRow.cloze_ranges).toBeNull()
    expect(cardRow.emphasis_ranges).toBeNull()
    expect(cardRow.translation_emphasis_ranges).toBeNull()
    expect(cardRow.last_review).toBeNull()
    expect(cardRow).not.toHaveProperty('dirty')

    const log: ReviewLog = {
      id: 'log-1',
      cardId: 'card-1',
      deckId: 'deck-1',
      rating: 'good',
      reviewedAt: 1000,
      stateBefore: 0,
      scheduledDays: 1,
      durationMs: 500,
      dirty: 1,
    }
    const logRow = toLogRow(log) as Record<string, unknown>
    expect(logRow.card_id).toBe('card-1')
    expect(logRow.deck_id).toBe('deck-1')
    expect(logRow).not.toHaveProperty('dirty')
  })
})
