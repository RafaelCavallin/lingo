import { z } from 'zod'
import { audioEntrySchema, cardSchema, deckSchema, reviewLogSchema } from './backupSchema'
import { BACKUP_FORMAT, BACKUP_VERSION, type ParsedManifest } from './backupFormat'

const envelope = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  accountId: z.string().nullable(),
  includesNarrations: z.boolean(),
  decks: z.array(z.unknown()),
  cards: z.array(z.unknown()),
  reviewLogs: z.array(z.unknown()),
  audio: z.array(z.unknown()),
})

function keepValid<T>(items: unknown[], schema: z.ZodType<T>): T[] {
  const kept: T[] = []
  for (const item of items) {
    const result = schema.safeParse(item)
    if (result.success) kept.push(result.data)
  }
  return kept
}

/** Formato ou versão divergente invalida o arquivo inteiro; registro solto
 *  malformado é só descartado, para um cartão corrompido não custar o backup
 *  todo — mesma postura de `syncRows` com a linha remota. */
export function parseManifest(raw: unknown): ParsedManifest | null {
  const parsed = envelope.safeParse(raw)
  if (!parsed.success) return null
  const m = parsed.data
  const content = {
    decks: keepValid(m.decks, deckSchema),
    cards: keepValid(m.cards, cardSchema),
    reviewLogs: keepValid(m.reviewLogs, reviewLogSchema),
    audio: keepValid(m.audio, audioEntrySchema),
  }
  const seen = m.decks.length + m.cards.length + m.reviewLogs.length + m.audio.length
  const kept = content.decks.length + content.cards.length + content.reviewLogs.length + content.audio.length
  return {
    exportedAt: m.exportedAt,
    accountId: m.accountId,
    includesNarrations: m.includesNarrations,
    ...content,
    discarded: seen - kept,
  }
}
