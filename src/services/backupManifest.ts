import { z } from 'zod'
import { audioEntrySchema } from './backupAudioSchema'
import { BackupFileInvalid, BackupFormatTooOld, BackupVersionTooNew } from './backupErrors'
import { BACKUP_FORMAT, BACKUP_VERSION, type ParsedManifest } from './backupFormat'
import { cardSchema, deckSchema, reviewLogSchema } from './backupSchema'
import { classifyManifest, upgradeFromPrevious } from './backupVersion'

const UNKNOWN_VALUE_ISSUE = 'invalid_value'

const envelope = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  appVersion: z.string().nullable(),
  exportedAt: z.number(),
  accountId: z.string().nullable(),
  includesNarrations: z.boolean(),
  decks: z.array(z.unknown()),
  cards: z.array(z.unknown()),
  reviewLogs: z.array(z.unknown()),
  audio: z.array(z.unknown()),
})

interface Kept<T> {
  items: T[]
  unknownValues: number
}

function keepValid<T>(items: unknown[], schema: z.ZodType<T>): Kept<T> {
  const kept: Kept<T> = { items: [], unknownValues: 0 }
  for (const item of items) {
    const result = schema.safeParse(item)
    if (result.success) kept.items.push(result.data)
    else if (result.error.issues.some((issue) => issue.code === UNKNOWN_VALUE_ISSUE)) kept.unknownValues += 1
  }
  return kept
}

function versionToRead(raw: unknown): { source: unknown; formatVersion: number; convertedFrom: number | null } {
  const found = classifyManifest(raw)
  if (found.kind === 'too-new') throw new BackupVersionTooNew()
  if (found.kind === 'too-old') throw new BackupFormatTooOld()
  if (found.kind === 'foreign') throw new BackupFileInvalid()
  if (found.kind === 'previous') {
    return { source: upgradeFromPrevious(found.raw), formatVersion: found.from, convertedFrom: found.from }
  }
  return { source: found.raw, formatVersion: BACKUP_VERSION, convertedFrom: null }
}

/** Versão ou formato fora do que o app lê invalida o arquivo inteiro, com um
 *  erro para cada caso; registro solto malformado é só descartado, para um
 *  cartão corrompido não custar o backup todo — mesma postura de `syncRows`
 *  com a linha remota. */
export function parseManifest(raw: unknown): ParsedManifest {
  const { source, formatVersion, convertedFrom } = versionToRead(raw)
  const parsed = envelope.safeParse(source)
  if (!parsed.success) throw new BackupFileInvalid()
  const m = parsed.data
  const decks = keepValid(m.decks, deckSchema)
  const cards = keepValid(m.cards, cardSchema)
  const reviewLogs = keepValid(m.reviewLogs, reviewLogSchema)
  const audio = keepValid(m.audio, audioEntrySchema)
  const seen = m.decks.length + m.cards.length + m.reviewLogs.length + m.audio.length
  const kept = decks.items.length + cards.items.length + reviewLogs.items.length + audio.items.length
  return {
    formatVersion,
    convertedFrom,
    appVersion: m.appVersion,
    exportedAt: m.exportedAt,
    accountId: m.accountId,
    includesNarrations: m.includesNarrations,
    decks: decks.items,
    cards: cards.items,
    reviewLogs: reviewLogs.items,
    audio: audio.items,
    discarded: seen - kept,
    unknownValues: decks.unknownValues + cards.unknownValues + reviewLogs.unknownValues + audio.unknownValues,
  }
}
