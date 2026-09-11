import type JSZip from 'jszip'
import type { AudioEntry } from './backupFormat'
import { selectApplicableAudio, type CardAudioState } from './backupPlan'
import { db } from './db'

export interface AudioRestoreResult {
  applied: number
  stale: number
  incomplete: boolean
}

/**
 * Espaço esgotado no navegador não é falha da restauração: os dados de estudo
 * já estão gravados e o áudio é regerável ou dispensável. A checagem é pelo
 * `name` porque quem chega aqui é uma `DOMException` — que não é `instanceof
 * Error` — ou o erro do Dexie que a envolve.
 */
function isQuotaExceeded(e: unknown): boolean {
  if (typeof e !== 'object' || e === null || !('name' in e)) return false
  return e.name === 'QuotaExceededError'
}

async function cardStates(entries: AudioEntry[]): Promise<Map<string, CardAudioState>> {
  const ids = [...new Set(entries.map((entry) => entry.cardId))]
  const cards = await db.cards.bulkGet(ids)
  const states = new Map<string, CardAudioState>()
  for (const card of cards) {
    if (card) states.set(card.id, { sentence: card.sentence, deletedAt: card.deletedAt })
  }
  return states
}

async function writeEntry(entry: AudioEntry, zip: JSZip): Promise<boolean> {
  const file = zip.file(entry.path)
  if (!file) return false
  const bytes = await file.async('arraybuffer')
  await db.audioBlobs.put({
    id: entry.id,
    cardId: entry.cardId,
    kind: entry.kind,
    blob: new Blob([bytes], { type: entry.mimeType }),
    createdAt: entry.createdAt,
    voice: entry.voice ?? undefined,
  })
  return true
}

export async function restoreAudio(input: {
  zip: JSZip
  entries: AudioEntry[]
  includeNarrations: boolean
  onProgress?: (done: number, total: number) => void
}): Promise<AudioRestoreResult> {
  const cards = await cardStates(input.entries)
  const decision = selectApplicableAudio({
    entries: input.entries,
    cards,
    includeNarrations: input.includeNarrations,
  })
  let applied = 0
  let missing = 0
  for (const entry of decision.applicable) {
    try {
      if (await writeEntry(entry, input.zip)) applied += 1
      else missing += 1
    } catch (e) {
      if (!isQuotaExceeded(e)) throw e
      return { applied, stale: decision.stale + missing, incomplete: true }
    }
    input.onProgress?.(applied + missing, decision.applicable.length)
  }
  return { applied, stale: decision.stale + missing, incomplete: false }
}
